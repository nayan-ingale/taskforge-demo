import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_NOW,
  PROJECT_IDS,
  SEED_TASKS,
  USER_IDS,
  seedTaskId,
  type DemoUserKey,
} from '../support/fixtures';
import { createTestContext, type TestContext } from '../support/harness';

let ctx: TestContext;

/** A fresh database for every test (for tests that write). */
function freshContextPerTest() {
  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await ctx.close();
  });
}

/** One database for the whole describe block (for tests that only read or get rejected). */
function sharedContext() {
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
}

const WEB = PROJECT_IDS.web;
const NOW_ISO = DEFAULT_TEST_NOW.toISOString();

function createTask(body: unknown, as: DemoUserKey = 'bob', projectId: string = WEB) {
  return ctx.request('POST', `/api/projects/${projectId}/tasks`, { as, body });
}

describe('POST /api/projects/:id/tasks — success', () => {
  freshContextPerTest();

  it('creates a task with defaults and returns 201', async () => {
    const res = await createTask({ title: '  Plan the launch  ' });

    expect(res.status).toBe(201);
    expect(res.json).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      projectId: WEB,
      title: 'Plan the launch',
      description: null,
      status: 'todo',
      priority: 'medium',
      assigneeId: null,
      dueDate: null,
      estimateHours: null,
      version: 1,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });
  });

  it('stores every optional field', async () => {
    const body = {
      title: 'Launch checklist',
      description: 'Everything we must do before go-live.',
      priority: 'urgent',
      assigneeId: USER_IDS.alice,
      dueDate: '2026-10-20',
      estimateHours: 0,
    };
    const res = await createTask(body);
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject(body);

    const fetched = await ctx.request('GET', `/api/tasks/${res.json.id}`, { as: 'vera' });
    expect(fetched.json).toEqual(res.json);
  });

  it('puts the new task first in the list and counts it', async () => {
    const created = await createTask({ title: 'Newest task' });
    const list = await ctx.request('GET', `/api/projects/${WEB}/tasks`, { as: 'bob' });
    expect(list.json.total).toBe(19);
    expect(list.json.items[0].id).toBe(created.json.id);
  });

  it('uses the injected clock for "today"', async () => {
    const later = await createTestContext({ now: new Date('2026-12-01T08:00:00Z') });
    try {
      const res = await later.request('POST', `/api/projects/${WEB}/tasks`, {
        as: 'bob',
        body: { title: 'Future work', dueDate: '2026-11-30' },
      });
      expect(res.status).toBe(400);
      const ok = await later.request('POST', `/api/projects/${WEB}/tasks`, {
        as: 'bob',
        body: { title: 'Future work', dueDate: '2026-12-01' },
      });
      expect(ok.status).toBe(201);
      expect(ok.json.createdAt).toBe('2026-12-01T08:00:00.000Z');
    } finally {
      await later.close();
    }
  });
});

describe('POST /api/projects/:id/tasks — rejected', () => {
  sharedContext();

  it.each([
    [{ title: 'ab' }, ['title']],
    [{ title: '   ' }, ['title']],
    [{ title: 'x'.repeat(121) }, ['title']],
    [{}, ['title']],
    [{ title: 'Valid', description: 'd'.repeat(2001) }, ['description']],
    [{ title: 'Valid', dueDate: '2026-10-19' }, ['dueDate']],
    [{ title: 'Valid', dueDate: '2026-02-30' }, ['dueDate']],
    [{ title: 'Valid', estimateHours: 201 }, ['estimateHours']],
    [{ title: 'Valid', estimateHours: -1 }, ['estimateHours']],
    [{ title: 'Valid', estimateHours: 2.5 }, ['estimateHours']],
    [{ title: 'Valid', priority: 'critical' }, ['priority']],
    [{ title: 'Valid', assigneeId: 'bob' }, ['assigneeId']],
    [{ title: 'x', priority: 'nope', estimateHours: 500 }, ['estimateHours', 'priority', 'title']],
  ])('rejects %j with 400 and field details', async (body, fields) => {
    const res = await createTask(body);
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('validation_failed');
    expect(Object.keys(res.json.error.details.fieldErrors).sort()).toEqual(fields);
  });

  it('reports the exact validation messages', async () => {
    const res = await createTask({ title: 'ab', dueDate: '2026-10-01' });
    expect(res.json.error).toEqual({
      code: 'validation_failed',
      message: 'Validation failed',
      details: {
        fieldErrors: {
          title: ['Title must be at least 3 characters'],
          dueDate: ['Due date cannot be in the past'],
        },
        formErrors: [],
      },
    });
  });

  it('rejects an assignee that does not exist', async () => {
    const res = await createTask({
      title: 'Valid',
      assigneeId: '10000000-0000-4000-8000-000000000099',
    });
    expect(res.status).toBe(400);
    expect(res.json.error.details.fieldErrors.assigneeId).toEqual(['Assignee does not exist']);
  });

  it('rejects unknown fields such as status', async () => {
    const res = await createTask({ title: 'Valid', status: 'done' });
    expect(res.status).toBe(400);
    expect(res.json.error.details.formErrors).toEqual(['Unrecognized key: "status"']);
  });

  it('rejects a missing or malformed JSON body', async () => {
    const missing = await ctx.request('POST', `/api/projects/${WEB}/tasks`, { as: 'bob' });
    expect(missing.status).toBe(400);

    const malformed = await ctx.request('POST', `/api/projects/${WEB}/tasks`, {
      as: 'bob',
      rawBody: '{"title": ',
    });
    expect(malformed.status).toBe(400);
    expect(malformed.json.error).toMatchObject({
      code: 'validation_failed',
      message: 'Request body must be valid JSON',
    });
  });

  it('leaves the task list unchanged', async () => {
    const list = await ctx.request('GET', `/api/projects/${WEB}/tasks`, { as: 'bob' });
    expect(list.json.total).toBe(18);
  });
});

describe('GET /api/tasks/:id', () => {
  sharedContext();

  it('returns a task', async () => {
    const seed = SEED_TASKS[2]!;
    const res = await ctx.request('GET', `/api/tasks/${seed.id}`, { as: 'vera' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ id: seed.id, title: seed.title, version: 1 });
  });

  it('returns 404 for archived tasks', async () => {
    const res = await ctx.request('GET', `/api/tasks/${seedTaskId(19)}`, { as: 'alice' });
    expect(res.status).toBe(404);
    expect(res.json.error).toEqual({ code: 'not_found', message: 'Task not found' });
  });

  it.each(['30000000-0000-4000-8000-000000000999', 'not-a-uuid', '%E0%A4%A'])(
    'returns 404 for unknown id %s',
    async (id) => {
      const res = await ctx.request('GET', `/api/tasks/${id}`, { as: 'vera' });
      expect(res.status).toBe(404);
      expect(res.json.error.code).toBe('not_found');
    },
  );
});

// Task 4: in_progress, medium, alice, due 2026-10-25, 3h, has a description.
const PATCH_TASK = seedTaskId(4);
const patch = (body: unknown, as: DemoUserKey = 'bob') =>
  ctx.request('PATCH', `/api/tasks/${PATCH_TASK}`, { as, body });

describe('PATCH /api/tasks/:id — partial updates', () => {
  freshContextPerTest();
  const TASK = PATCH_TASK;

  it('changes only the fields present in the body', async () => {
    const before = (await ctx.request('GET', `/api/tasks/${TASK}`, { as: 'bob' })).json;

    const res = await patch({ version: 1, title: 'Password reset emails' });

    expect(res.status).toBe(200);
    expect(res.json).toEqual({
      ...before,
      title: 'Password reset emails',
      version: 2,
      updatedAt: NOW_ISO,
    });
  });

  it('clears nullable fields when they are explicitly null', async () => {
    const res = await patch({
      version: 1,
      description: null,
      assigneeId: null,
      dueDate: null,
      estimateHours: null,
    });

    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      title: 'Password reset email template',
      priority: 'medium',
      status: 'in_progress',
      description: null,
      assigneeId: null,
      dueDate: null,
      estimateHours: null,
    });
  });

  it('treats a blank description as null', async () => {
    const res = await patch({ version: 1, description: '   ' });
    expect(res.json.description).toBeNull();
  });

  it('persists the change', async () => {
    await patch({ version: 1, priority: 'urgent', assigneeId: USER_IDS.bob, estimateHours: 8 });
    const res = await ctx.request('GET', `/api/tasks/${TASK}`, { as: 'vera' });
    expect(res.json).toMatchObject({
      priority: 'urgent',
      assigneeId: USER_IDS.bob,
      estimateHours: 8,
      dueDate: '2026-10-25',
      version: 2,
    });
  });

  it('does not re-validate an untouched due date that is already in the past', async () => {
    // Task 7 is overdue (due 2026-10-15); editing its title must still work.
    const res = await ctx.request('PATCH', `/api/tasks/${seedTaskId(7)}`, {
      as: 'bob',
      body: { version: 1, title: 'Fix layout shift on all images' },
    });
    expect(res.status).toBe(200);
    expect(res.json.dueDate).toBe('2026-10-15');
  });
});

describe('PATCH /api/tasks/:id — rejected', () => {
  sharedContext();
  const TASK = PATCH_TASK;

  it.each([
    [{ version: 1, title: null }, 'title'],
    [{ version: 1, title: 'no' }, 'title'],
    [{ version: 1, dueDate: '2026-10-19' }, 'dueDate'],
    [{ version: 1, estimateHours: 201 }, 'estimateHours'],
    [{ version: 1, priority: 'critical' }, 'priority'],
    [{ title: 'Missing version' }, 'version'],
    [{ version: '1', title: 'String version' }, 'version'],
  ])('rejects %j with 400', async (body, field) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(res.json.error.details.fieldErrors[field]).toBeDefined();
  });

  it('refuses to change status (use the transition endpoint)', async () => {
    const res = await patch({ version: 1, status: 'done' });
    expect(res.status).toBe(400);
    expect(res.json.error.details.fieldErrors.status).toEqual([
      'Status cannot be changed here; use POST /api/tasks/:id/transition',
    ]);
    const after = await ctx.request('GET', `/api/tasks/${TASK}`, { as: 'bob' });
    expect(after.json).toMatchObject({ status: 'in_progress', version: 1 });
  });

  it('requires at least one field besides version', async () => {
    const res = await patch({ version: 1 });
    expect(res.status).toBe(400);
    expect(res.json.error.details.formErrors).toEqual(['Provide at least one field to update']);
  });

  it('rejects an unknown assignee', async () => {
    const res = await patch({ version: 1, assigneeId: '10000000-0000-4000-8000-000000000099' });
    expect(res.status).toBe(400);
    expect(res.json.error.details.fieldErrors.assigneeId).toEqual(['Assignee does not exist']);
  });

  it('returns 404 for archived or unknown tasks', async () => {
    const archived = await ctx.request('PATCH', `/api/tasks/${seedTaskId(19)}`, {
      as: 'alice',
      body: { version: 2, title: 'Revive' },
    });
    expect(archived.status).toBe(404);
    const unknown = await ctx.request('PATCH', '/api/tasks/30000000-0000-4000-8000-000000000999', {
      as: 'alice',
      body: { version: 1, title: 'Ghost' },
    });
    expect(unknown.status).toBe(404);
  });
});

describe('optimistic concurrency', () => {
  freshContextPerTest();
  const TASK = seedTaskId(6);

  it('increments version on every change', async () => {
    const first = await ctx.request('PATCH', `/api/tasks/${TASK}`, {
      as: 'bob',
      body: { version: 1, priority: 'low' },
    });
    const second = await ctx.request('PATCH', `/api/tasks/${TASK}`, {
      as: 'bob',
      body: { version: 2, priority: 'medium' },
    });
    const third = await ctx.request('POST', `/api/tasks/${TASK}/transition`, {
      as: 'bob',
      body: { to: 'in_progress', version: 3 },
    });
    expect([first.json.version, second.json.version, third.json.version]).toEqual([2, 3, 4]);
  });

  it('rejects a stale version with 409 and leaves the task unchanged', async () => {
    await ctx.request('PATCH', `/api/tasks/${TASK}`, {
      as: 'bob',
      body: { version: 1, title: 'Pricing page experiment' },
    });

    const stale = await ctx.request('PATCH', `/api/tasks/${TASK}`, {
      as: 'alice',
      body: { version: 1, title: 'Overwritten?' },
    });

    expect(stale.status).toBe(409);
    expect(stale.json.error).toEqual({
      code: 'conflict',
      message: 'This task was changed by someone else. Reload it and try again.',
      details: { currentVersion: 2 },
    });
    const current = await ctx.request('GET', `/api/tasks/${TASK}`, { as: 'vera' });
    expect(current.json).toMatchObject({ title: 'Pricing page experiment', version: 2 });
  });

  it('rejects a version from the future with 409', async () => {
    const res = await ctx.request('PATCH', `/api/tasks/${TASK}`, {
      as: 'bob',
      body: { version: 5, title: 'Too new' },
    });
    expect(res.status).toBe(409);
  });

  it('lets exactly one of two concurrent writers win', async () => {
    const [a, b] = await Promise.all([
      ctx.request('PATCH', `/api/tasks/${TASK}`, {
        as: 'bob',
        body: { version: 1, title: 'Writer A' },
      }),
      ctx.request('PATCH', `/api/tasks/${TASK}`, {
        as: 'alice',
        body: { version: 1, title: 'Writer B' },
      }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const current = await ctx.request('GET', `/api/tasks/${TASK}`, { as: 'vera' });
    expect(current.json.version).toBe(2);
  });
});

describe('DELETE /api/tasks/:id (archive)', () => {
  freshContextPerTest();
  const TASK = seedTaskId(5);

  it('archives the task: 204, then it disappears everywhere', async () => {
    const before = await ctx.request('GET', `/api/projects/${WEB}/dashboard`, { as: 'alice' });

    const res = await ctx.request('DELETE', `/api/tasks/${TASK}`, { as: 'alice' });

    expect(res.status).toBe(204);
    expect(res.json).toBeNull();
    expect((await ctx.request('GET', `/api/tasks/${TASK}`, { as: 'alice' })).status).toBe(404);
    const list = await ctx.request('GET', `/api/projects/${WEB}/tasks?pageSize=50`, {
      as: 'alice',
    });
    expect(list.json.total).toBe(17);
    expect(list.json.items.map((task: { id: string }) => task.id)).not.toContain(TASK);
    const search = await ctx.request('GET', `/api/projects/${WEB}/tasks?q=footer`, { as: 'alice' });
    expect(search.json.total).toBe(0);
    const after = await ctx.request('GET', `/api/projects/${WEB}/dashboard`, { as: 'alice' });
    expect(after.json.total).toBe(before.json.total - 1);
    expect(after.json.byStatus.todo).toBe(before.json.byStatus.todo - 1);
  });

  it('returns 404 when archiving twice or an unknown task', async () => {
    await ctx.request('DELETE', `/api/tasks/${TASK}`, { as: 'alice' });
    expect((await ctx.request('DELETE', `/api/tasks/${TASK}`, { as: 'alice' })).status).toBe(404);
    expect((await ctx.request('DELETE', '/api/tasks/not-a-uuid', { as: 'alice' })).status).toBe(
      404,
    );
  });

  it.each(['bob', 'vera'] as const)('is forbidden for %s', async (as) => {
    const res = await ctx.request('DELETE', `/api/tasks/${TASK}`, { as });
    expect(res.status).toBe(403);
    expect((await ctx.request('GET', `/api/tasks/${TASK}`, { as: 'alice' })).status).toBe(200);
  });
});

describe('text that PostgreSQL cannot store', () => {
  sharedContext();

  it('rejects NUL characters with 400 instead of failing in the database', async () => {
    const create = await createTask({ title: 'Bad\u0000title' });
    expect(create.status).toBe(400);
    expect(create.json.error.details.fieldErrors.title).toEqual([
      'Must not contain NUL characters',
    ]);

    const search = await ctx.request('GET', `/api/projects/${WEB}/tasks?q=%00`, { as: 'bob' });
    expect(search.status).toBe(400);
    expect(search.json.error.details.fieldErrors.q).toEqual(['Must not contain NUL characters']);
  });
});
