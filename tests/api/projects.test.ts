import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TEST_NOW, PROJECT_IDS, SEED_PROJECTS } from '../support/fixtures';
import { createTestContext, type TestContext } from '../support/harness';

describe('reading projects', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('GET /api/projects lists projects ordered by key', async () => {
    const res = await ctx.request('GET', '/api/projects', { as: 'vera' });
    expect(res.status).toBe(200);
    expect(res.json.items.map((project: { key: string }) => project.key)).toEqual(['MOB', 'WEB']);
    expect(res.json.items[1]).toEqual(SEED_PROJECTS[0]);
  });

  it('GET /api/projects/:id returns one project', async () => {
    const res = await ctx.request('GET', `/api/projects/${PROJECT_IDS.mobile}`, { as: 'bob' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ id: PROJECT_IDS.mobile, key: 'MOB', name: 'Mobile App' });
  });

  it.each(['20000000-0000-4000-8000-000000000099', 'not-a-uuid', 'WEB'])(
    'GET /api/projects/:id returns 404 for unknown id %s',
    async (id) => {
      const res = await ctx.request('GET', `/api/projects/${id}`, { as: 'bob' });
      expect(res.status).toBe(404);
      expect(res.json.error).toEqual({ code: 'not_found', message: 'Project not found' });
    },
  );
});

describe('POST /api/projects', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await ctx.close();
  });

  const body = { key: 'OPS', name: '  Operations  ', description: 'Runbooks and on-call.' };

  it('lets an admin create a project', async () => {
    const res = await ctx.request('POST', '/api/projects', { as: 'alice', body });

    expect(res.status).toBe(201);
    expect(res.json).toEqual({
      id: expect.any(String),
      key: 'OPS',
      name: 'Operations',
      description: 'Runbooks and on-call.',
      createdAt: DEFAULT_TEST_NOW.toISOString(),
    });
    const list = await ctx.request('GET', '/api/projects', { as: 'vera' });
    expect(list.json.items.map((project: { key: string }) => project.key)).toEqual([
      'MOB',
      'OPS',
      'WEB',
    ]);
  });

  it.each(['bob', 'vera'] as const)('forbids %s (not an admin)', async (as) => {
    const res = await ctx.request('POST', '/api/projects', { as, body });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('forbidden');
    const list = await ctx.request('GET', '/api/projects', { as: 'vera' });
    expect(list.json.items).toHaveLength(2);
  });

  it('rejects a duplicate key with 409', async () => {
    const res = await ctx.request('POST', '/api/projects', {
      as: 'alice',
      body: { key: 'WEB', name: 'Another web project' },
    });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe('conflict');
  });

  it('validates the body', async () => {
    const res = await ctx.request('POST', '/api/projects', {
      as: 'alice',
      body: { key: 'ops', name: 'O' },
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.json.error.details.fieldErrors).sort()).toEqual(['key', 'name']);
  });
});
