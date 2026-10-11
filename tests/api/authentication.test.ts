import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROJECT_IDS, seedTaskId } from '../support/fixtures';
import { createTestContext, type TestContext } from '../support/harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

const web = PROJECT_IDS.web;
const task = seedTaskId(5);

describe('every API endpoint except the session ones requires a signed-in user', () => {
  it.each([
    ['GET', '/api/users'],
    ['GET', '/api/projects'],
    ['POST', '/api/projects'],
    ['GET', `/api/projects/${web}`],
    ['GET', `/api/projects/${web}/tasks`],
    ['POST', `/api/projects/${web}/tasks`],
    ['GET', `/api/projects/${web}/dashboard`],
    ['GET', `/api/tasks/${task}`],
    ['PATCH', `/api/tasks/${task}`],
    ['DELETE', `/api/tasks/${task}`],
    ['POST', `/api/tasks/${task}/transition`],
    ['GET', '/api/session'],
  ])('%s %s -> 401', async (method, path) => {
    const res = await ctx.request(method, path, { body: method === 'GET' ? undefined : {} });
    expect(res.status).toBe(401);
    expect(res.json).toEqual({
      error: { code: 'unauthorized', message: 'Authentication required' },
    });
  });

  it('does not change data when the request is rejected', async () => {
    await ctx.request('DELETE', `/api/tasks/${task}`);
    expect((await ctx.request('GET', `/api/tasks/${task}`, { as: 'vera' })).status).toBe(200);
  });
});

describe('GET /api/users', () => {
  it('lists the demo users by name for any signed-in user', async () => {
    const res = await ctx.request('GET', '/api/users', { as: 'vera' });
    expect(res.status).toBe(200);
    expect(res.json.items.map((user: { name: string }) => user.name)).toEqual([
      'Alice Admin',
      'Bob Member',
      'Vera Viewer',
    ]);
  });
});
