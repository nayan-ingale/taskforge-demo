import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../support/harness';

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

function dashboard(projectId: string, context: TestContext = ctx) {
  return context.request('GET', `/api/projects/${projectId}/dashboard`, { as: 'vera' });
}

describe('GET /api/projects/:id/dashboard', () => {
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

  it('returns 404 for an unknown project', async () => {
    const res = await dashboard('20000000-0000-4000-8000-000000000099');
    expect(res.status).toBe(404);
  });
});
