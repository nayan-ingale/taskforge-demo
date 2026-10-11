import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/domain/enums';
import { DEFAULT_TEST_TODAY, PROJECT_IDS, seedTaskId } from '../support/fixtures';
import { createTestContext, type TestContext } from '../support/harness';
import { visibleSeedTasks } from '../support/seed-expectations';

// Read-only tests share one database; tests that write create their own context.
let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

async function withFreshContext(run: (context: TestContext) => Promise<void>) {
  const context = await createTestContext();
  try {
    await run(context);
  } finally {
    await context.close();
  }
}

const WEB = PROJECT_IDS.web;
const MOB = PROJECT_IDS.mobile;

function dashboard(projectId: string, context: TestContext = ctx) {
  return context.request('GET', `/api/projects/${projectId}/dashboard`, { as: 'vera' });
}

function listTotal(projectId: string, query = '', context: TestContext = ctx) {
  return context
    .request('GET', `/api/projects/${projectId}/tasks?${query}`, { as: 'vera' })
    .then((res) => res.json.total as number);
}

/** Recomputes the dashboard from the seed fixtures. */
function expectedDashboard(projectId: string, today: string) {
  const tasks = visibleSeedTasks(projectId);
  const count = (predicate: (task: (typeof tasks)[number]) => boolean) =>
    tasks.filter(predicate).length;
  return {
    total: tasks.length,
    byStatus: Object.fromEntries(TASK_STATUSES.map((s) => [s, count((t) => t.status === s)])),
    byPriority: Object.fromEntries(TASK_PRIORITIES.map((p) => [p, count((t) => t.priority === p)])),
    overdue: count((t) => t.dueDate !== null && t.dueDate < today && t.status !== 'done'),
  };
}

/** Asserts that the dashboard agrees with the task list for every status and priority filter. */
async function expectDashboardMatchesList(projectId: string, context: TestContext = ctx) {
  const res = await dashboard(projectId, context);
  expect(res.json.total).toBe(await listTotal(projectId, '', context));
  for (const status of TASK_STATUSES) {
    expect(res.json.byStatus[status]).toBe(await listTotal(projectId, `status=${status}`, context));
  }
  for (const priority of TASK_PRIORITIES) {
    expect(res.json.byPriority[priority]).toBe(
      await listTotal(projectId, `priority=${priority}`, context),
    );
  }
}

describe('GET /api/projects/:id/dashboard', () => {
  it('summarizes the seeded WEB project', async () => {
    const res = await dashboard(WEB);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({
      total: 18,
      byStatus: { todo: 9, in_progress: 4, in_review: 2, done: 3 },
      byPriority: { low: 5, medium: 5, high: 5, urgent: 3 },
      overdue: 3,
    });
    expect(res.json).toEqual(expectedDashboard(WEB, DEFAULT_TEST_TODAY));
  });

  it('summarizes the seeded MOB project', async () => {
    const res = await dashboard(MOB);
    expect(res.json).toEqual(expectedDashboard(MOB, DEFAULT_TEST_TODAY));
    expect(res.json.total).toBe(9);
    expect(res.json.overdue).toBe(2);
  });

  it('includes every status and priority key, even when the count is zero', async () => {
    await withFreshContext(async (own) => {
      const created = await own.request('POST', '/api/projects', {
        as: 'alice',
        body: { key: 'EMPTY', name: 'Empty project' },
      });
      const res = await dashboard(created.json.id, own);
      expect(res.json).toEqual({
        total: 0,
        byStatus: { todo: 0, in_progress: 0, in_review: 0, done: 0 },
        byPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
        overdue: 0,
      });
    });
  });

  it.each([WEB, MOB])('agrees with the task list totals for project %s', async (projectId) => {
    await expectDashboardMatchesList(projectId);
  });

  it('still agrees with the list after creating, moving and archiving tasks', async () => {
    await withFreshContext(async (own) => {
      await own.request('POST', `/api/projects/${WEB}/tasks`, {
        as: 'bob',
        body: { title: 'Fresh task', priority: 'urgent' },
      });
      await own.request('POST', `/api/tasks/${seedTaskId(3)}/transition`, {
        as: 'bob',
        body: { to: 'done', version: 1 },
      });
      await own.request('DELETE', `/api/tasks/${seedTaskId(16)}`, { as: 'alice' });

      await expectDashboardMatchesList(WEB, own);
      const res = await dashboard(WEB, own);
      expect(res.json.total).toBe(18);
      expect(res.json.byStatus.done).toBe(4);
      expect(res.json.overdue).toBe(2); // task 3 was overdue but is now done
    });
  });

  it('returns 404 for an unknown project', async () => {
    const res = await dashboard('20000000-0000-4000-8000-000000000099');
    expect(res.status).toBe(404);
  });
});

describe('overdue', () => {
  it('excludes tasks due today, done tasks and archived tasks', async () => {
    // WEB overdue on 2026-10-20: tasks 3, 7 and 15. Not overdue: task 10 (due today),
    // tasks 1, 2 and 11 (done with past due dates), task 19 (archived, past due).
    expect((await dashboard(WEB)).json.overdue).toBe(3);
  });

  it('is relative to the injected clock', async () => {
    const tomorrow = await createTestContext({ now: new Date('2026-10-21T00:00:00Z') });
    const muchLater = await createTestContext({ now: new Date('2027-01-01T00:00:00Z') });
    const earlier = await createTestContext({ now: new Date('2026-09-01T00:00:00Z') });
    try {
      // Task 10 (due 2026-10-20, in review) becomes overdue the next day.
      expect((await dashboard(WEB, tomorrow)).json.overdue).toBe(4);
      expect((await dashboard(WEB, muchLater)).json.overdue).toBe(
        expectedDashboard(WEB, '2027-01-01').overdue,
      );
      expect((await dashboard(WEB, earlier)).json.overdue).toBe(0);
    } finally {
      await Promise.all([tomorrow.close(), muchLater.close(), earlier.close()]);
    }
  });
});
