import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROJECT_IDS, SEED_TASKS, seedTaskId, type DemoUserKey } from '../support/fixtures';
import { createTestContext, type TestContext } from '../support/harness';
import { ids, visibleSeedTasks } from '../support/seed-expectations';

// Read-only tests: one shared context is enough.
let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

const WEB = PROJECT_IDS.web;
const MOB = PROJECT_IDS.mobile;
const webTasks = visibleSeedTasks(WEB);

function list(query = '', projectId: string = WEB, as: DemoUserKey = 'vera') {
  return ctx.request('GET', `/api/projects/${projectId}/tasks${query ? `?${query}` : ''}`, { as });
}

describe('GET /api/projects/:id/tasks — pagination', () => {
  it('defaults to page 1 of 10, newest first', async () => {
    const res = await list();

    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ page: 1, pageSize: 10, total: 18, totalPages: 2 });
    expect(ids(res.json.items)).toEqual(ids(webTasks.slice(0, 10)));
  });

  it('returns full task objects', async () => {
    const res = await list('pageSize=1');
    const newest = webTasks[0]!;
    expect(res.json.items[0]).toEqual({
      id: newest.id,
      projectId: WEB,
      title: newest.title,
      description: newest.description,
      status: newest.status,
      priority: newest.priority,
      assigneeId: newest.assigneeId,
      dueDate: newest.dueDate,
      estimateHours: newest.estimateHours,
      version: 1,
      createdAt: newest.createdAt,
      updatedAt: newest.createdAt,
    });
  });

  it('breaks createdAt ties by id descending (tasks 12 and 13 share a timestamp)', async () => {
    const res = await list('pageSize=50');
    const order = ids(res.json.items);
    expect(order.indexOf(seedTaskId(13))).toBe(order.indexOf(seedTaskId(12)) - 1);
  });

  it('returns an empty page past the end but still reports the totals', async () => {
    const res = await list('page=3&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ items: [], page: 3, pageSize: 10, total: 18, totalPages: 2 });
  });

  it('treats empty query values as "not set"', async () => {
    const res = await list('status=&priority=&q=&page=&pageSize=');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ page: 1, pageSize: 10, total: 18 });
  });

  it.each([
    ['page=0', 'page'],
    ['page=-2', 'page'],
    ['page=abc', 'page'],
    ['page=1.5', 'page'],
    ['pageSize=0', 'pageSize'],
    ['pageSize=51', 'pageSize'],
    ['pageSize=ten', 'pageSize'],
  ])('rejects %s with 400', async (query, field) => {
    const res = await list(query);
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('validation_failed');
    expect(res.json.error.details.fieldErrors[field]).toBeDefined();
  });

  it('accepts the maximum page size of 50', async () => {
    const res = await list('pageSize=50');
    expect(res.status).toBe(200);
    expect(res.json.items).toHaveLength(18);
    expect(res.json.totalPages).toBe(1);
  });
});

describe('GET /api/projects/:id/tasks — visibility', () => {
  it('never returns archived tasks', async () => {
    const res = await list('pageSize=50');
    const archived = SEED_TASKS.filter((task) => task.archivedAt).map((task) => task.id);
    expect(archived).toHaveLength(3);
    for (const id of archived) expect(ids(res.json.items)).not.toContain(id);
  });

  it('only returns tasks of the requested project', async () => {
    const res = await list('pageSize=50', MOB);
    expect(res.json.total).toBe(9);
    expect(ids(res.json.items)).toEqual(ids(visibleSeedTasks(MOB)));
    expect(res.json.items.every((task: { projectId: string }) => task.projectId === MOB)).toBe(
      true,
    );
  });

  it('is readable by every role', async () => {
    for (const as of ['alice', 'bob', 'vera'] as const) {
      expect((await list('', WEB, as)).status).toBe(200);
    }
  });

  it.each(['20000000-0000-4000-8000-000000000099', 'nope'])(
    'returns 404 for unknown project %s',
    async (projectId) => {
      const res = await list('', projectId);
      expect(res.status).toBe(404);
      expect(res.json.error.code).toBe('not_found');
    },
  );
});

describe('GET /api/projects/:id/tasks — filters', () => {
  const expectFiltered = (predicate: (task: (typeof webTasks)[number]) => boolean) =>
    ids(webTasks.filter(predicate));

  it.each(['todo', 'in_progress', 'in_review', 'done'] as const)(
    'filters by status=%s',
    async (status) => {
      const res = await list(`status=${status}&pageSize=50`);
      const expected = expectFiltered((task) => task.status === status);
      expect(res.json.total).toBe(expected.length);
      expect(ids(res.json.items)).toEqual(expected);
    },
  );

  it.each(['low', 'medium', 'high', 'urgent'] as const)(
    'filters by priority=%s',
    async (priority) => {
      const res = await list(`priority=${priority}&pageSize=50`);
      const expected = expectFiltered((task) => task.priority === priority);
      expect(res.json.total).toBe(expected.length);
      expect(ids(res.json.items)).toEqual(expected);
    },
  );

  it('combines status and priority with AND', async () => {
    const res = await list('status=todo&priority=low&pageSize=50');
    const expected = expectFiltered((task) => task.status === 'todo' && task.priority === 'low');
    expect(expected.length).toBeGreaterThan(1);
    expect(res.json.total).toBe(expected.length);
    expect(ids(res.json.items)).toEqual(expected);
  });

  it('returns an empty result (not an error) when nothing matches', async () => {
    const res = await list('status=done&priority=low');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
  });

  it.each(['status=closed', 'priority=critical', 'status=TODO'])(
    'rejects unknown enum value (%s) with 400',
    async (query) => {
      const res = await list(query);
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('validation_failed');
    },
  );
});

describe('GET /api/projects/:id/tasks — search', () => {
  const LOGIN_TASKS = [seedTaskId(15), seedTaskId(4), seedTaskId(3)];

  it.each(['login', 'LOGIN', 'LoGiN', '  login  '])(
    'matches title and description case-insensitively (q=%j)',
    async (q) => {
      const res = await list(`q=${encodeURIComponent(q)}`);
      expect(res.json.total).toBe(3);
      expect(ids(res.json.items)).toEqual(LOGIN_TASKS);
    },
  );

  it('matches text that only appears in the description', async () => {
    const res = await list('q=AVIF');
    expect(ids(res.json.items)).toEqual([seedTaskId(16)]);
  });

  it('does not return archived tasks or tasks of other projects', async () => {
    // "login" also appears in archived tasks 19 and 30 and in MOB task 24.
    const res = await list('q=login&pageSize=50');
    expect(ids(res.json.items)).not.toContain(seedTaskId(19));
    expect(ids(res.json.items)).not.toContain(seedTaskId(24));
    const mobile = await list('q=login', MOB);
    expect(ids(mobile.json.items)).toEqual([seedTaskId(24)]);
  });

  it('treats % and _ literally', async () => {
    expect(ids((await list(`q=${encodeURIComponent('100%')}`)).json.items)).toEqual([
      seedTaskId(8),
    ]);
    expect(ids((await list(`q=${encodeURIComponent('%')}`)).json.items)).toEqual([seedTaskId(8)]);
    expect(ids((await list('q=_')).json.items)).toEqual([seedTaskId(9)]);
    expect(ids((await list('q=user_id')).json.items)).toEqual([seedTaskId(9)]);
    expect((await list(`q=${encodeURIComponent('\\')}`)).json.total).toBe(0);
  });

  it('combines search with filters', async () => {
    const res = await list('q=login&status=todo');
    expect(ids(res.json.items)).toEqual([seedTaskId(15)]);
  });

  it('returns an empty page when nothing matches', async () => {
    const res = await list('q=kubernetes');
    expect(res.json).toMatchObject({ items: [], total: 0, totalPages: 0 });
  });

  it('rejects searches longer than 200 characters', async () => {
    const res = await list(`q=${'a'.repeat(201)}`);
    expect(res.status).toBe(400);
    expect(res.json.error.details.fieldErrors.q).toBeDefined();
  });
});
