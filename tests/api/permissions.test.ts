import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROJECT_IDS, seedTaskId, type DemoUserKey } from '../support/fixtures';
import { createTestContext, type TestContext } from '../support/harness';

const WEB = PROJECT_IDS.web;

// Every user acts on their own seeded `todo` task, so the whole matrix can share one database
// without one user's successful write changing another user's expected outcome.
const OWN_TASK: Record<DemoUserKey, string> = {
  alice: seedTaskId(12),
  bob: seedTaskId(13),
  vera: seedTaskId(5),
};

interface Case {
  name: string;
  method: string;
  path: (user: DemoUserKey) => string;
  /** `version` is the current version of the user's own task. */
  body?: (user: DemoUserKey, version: number) => unknown;
  success: number;
}

const CASES: Case[] = [
  { name: 'list projects', method: 'GET', path: () => '/api/projects', success: 200 },
  { name: 'get project', method: 'GET', path: () => `/api/projects/${WEB}`, success: 200 },
  {
    name: 'create project',
    method: 'POST',
    path: () => '/api/projects',
    body: (user) => ({ key: `P${user.toUpperCase()}`, name: `Project of ${user}` }),
    success: 201,
  },
  { name: 'list tasks', method: 'GET', path: () => `/api/projects/${WEB}/tasks`, success: 200 },
  { name: 'dashboard', method: 'GET', path: () => `/api/projects/${WEB}/dashboard`, success: 200 },
  { name: 'get task', method: 'GET', path: (user) => `/api/tasks/${OWN_TASK[user]}`, success: 200 },
  {
    name: 'create task',
    method: 'POST',
    path: () => `/api/projects/${WEB}/tasks`,
    body: () => ({ title: 'Permission check' }),
    success: 201,
  },
  {
    name: 'update task',
    method: 'PATCH',
    path: (user) => `/api/tasks/${OWN_TASK[user]}`,
    body: (_user, version) => ({ version, title: 'Renamed' }),
    success: 200,
  },
  {
    name: 'transition task',
    method: 'POST',
    path: (user) => `/api/tasks/${OWN_TASK[user]}/transition`,
    body: (_user, version) => ({ to: 'in_progress', version }),
    success: 200,
  },
  {
    name: 'archive task',
    method: 'DELETE',
    path: (user) => `/api/tasks/${OWN_TASK[user]}`,
    success: 204,
  },
];

const ALLOWED: Record<DemoUserKey, readonly string[]> = {
  alice: CASES.map((c) => c.name),
  bob: [
    'list projects',
    'get project',
    'list tasks',
    'dashboard',
    'get task',
    'create task',
    'update task',
    'transition task',
  ],
  vera: ['list projects', 'get project', 'list tasks', 'dashboard', 'get task'],
};

describe('authorization matrix (alice = admin, bob = member, vera = viewer)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const MATRIX = (['alice', 'bob', 'vera'] as const).flatMap((user) =>
    CASES.map((c) => [user, c.name, c] as const),
  );

  it.each(MATRIX)('%s: %s', async (user, name, c) => {
    const task = await ctx.request('GET', `/api/tasks/${OWN_TASK[user]}`, { as: 'alice' });
    const body = c.body?.(user, task.json.version as number);

    const res = await ctx.request(c.method, c.path(user), { as: user, body });

    if (ALLOWED[user].includes(name)) {
      expect(res.status).toBe(c.success);
    } else {
      expect(res.status).toBe(403);
      expect(res.json).toEqual({
        error: { code: 'forbidden', message: 'You do not have permission to do that' },
      });
    }
  });
});

describe('forbidden requests', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const TASK = seedTaskId(5);

  it('have no side effects', async () => {
    await ctx.request('POST', `/api/projects/${WEB}/tasks`, {
      as: 'vera',
      body: { title: 'Nope' },
    });
    await ctx.request('PATCH', `/api/tasks/${TASK}`, {
      as: 'vera',
      body: { version: 1, title: 'Nope' },
    });
    await ctx.request('POST', `/api/tasks/${TASK}/transition`, {
      as: 'vera',
      body: { to: 'in_progress', version: 1 },
    });
    await ctx.request('DELETE', `/api/tasks/${TASK}`, { as: 'bob' });
    await ctx.request('POST', '/api/projects', { as: 'bob', body: { key: 'NOPE', name: 'Nope' } });

    const task = await ctx.request('GET', `/api/tasks/${TASK}`, { as: 'vera' });
    expect(task.json).toMatchObject({ title: 'Footer links audit', status: 'todo', version: 1 });
    const list = await ctx.request('GET', `/api/projects/${WEB}/tasks`, { as: 'vera' });
    expect(list.json.total).toBe(18);
    const projects = await ctx.request('GET', '/api/projects', { as: 'vera' });
    expect(projects.json.items).toHaveLength(2);
  });

  it('are rejected before the body is validated', async () => {
    const res = await ctx.request('POST', `/api/projects/${WEB}/tasks`, {
      as: 'vera',
      body: { title: 'x' },
    });
    expect(res.status).toBe(403);
  });

  it('are rejected before the resource is looked up', async () => {
    const res = await ctx.request('DELETE', '/api/tasks/30000000-0000-4000-8000-000000000999', {
      as: 'bob',
    });
    expect(res.status).toBe(403);
  });
});
