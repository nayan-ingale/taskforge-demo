import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TEST_NOW, seedTaskId } from '../support/fixtures';
import { createTestContext, type TestContext } from '../support/harness';

let ctx: TestContext;

// Seeded tasks by status (all at version 1).
const TODO = seedTaskId(5);
const IN_PROGRESS = seedTaskId(7);
const IN_REVIEW = seedTaskId(3);
const DONE = seedTaskId(1);

function transition(taskId: string, body: unknown, as: 'alice' | 'bob' | 'vera' = 'bob') {
  return ctx.request('POST', `/api/tasks/${taskId}/transition`, { as, body });
}

describe('POST /api/tasks/:id/transition — legal moves', () => {
  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it.each([
    [TODO, 'todo', 'in_progress'],
    [IN_PROGRESS, 'in_progress', 'in_review'],
    [IN_PROGRESS, 'in_progress', 'todo'],
    [IN_REVIEW, 'in_review', 'done'],
    [IN_REVIEW, 'in_review', 'in_progress'],
    [DONE, 'done', 'in_progress'],
  ])('moves %s from %s to %s', async (taskId, from, to) => {
    expect((await ctx.request('GET', `/api/tasks/${taskId}`, { as: 'bob' })).json.status).toBe(
      from,
    );

    const res = await transition(taskId, { to, version: 1 });

    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      id: taskId,
      status: to,
      version: 2,
      updatedAt: DEFAULT_TEST_NOW.toISOString(),
    });
  });

  it('walks the full lifecycle including a reopen', async () => {
    const steps = ['in_progress', 'in_review', 'in_progress', 'in_review', 'done', 'in_progress'];
    let version = 1;
    for (const to of steps) {
      const res = await transition(TODO, { to, version });
      expect(res.status).toBe(200);
      expect(res.json.status).toBe(to);
      version = res.json.version;
    }
    expect(version).toBe(steps.length + 1);
  });
});

// Rejected requests never change data, so these tests share one database.
describe('POST /api/tasks/:id/transition — rejected moves', () => {
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it.each([
    [TODO, 'done'],
    [TODO, 'in_review'],
    [TODO, 'todo'],
    [IN_PROGRESS, 'done'],
    [IN_REVIEW, 'todo'],
    [DONE, 'todo'],
    [DONE, 'in_review'],
    [DONE, 'done'],
  ])('rejects %s -> %s with 422', async (taskId, to) => {
    const before = (await ctx.request('GET', `/api/tasks/${taskId}`, { as: 'bob' })).json;

    const res = await transition(taskId, { to, version: 1 });

    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe('invalid_transition');
    expect(res.json.error.details).toMatchObject({ from: before.status, to });
    const after = (await ctx.request('GET', `/api/tasks/${taskId}`, { as: 'bob' })).json;
    expect(after).toEqual(before);
  });

  it('explains which moves are allowed', async () => {
    const res = await transition(TODO, { to: 'done', version: 1 });
    expect(res.json.error).toEqual({
      code: 'invalid_transition',
      message: 'A task cannot move from todo to done',
      details: { from: 'todo', to: 'done', allowed: ['in_progress'] },
    });
  });

  it('checks the version before the transition rule (stale -> 409 even if illegal)', async () => {
    const res = await transition(TODO, { to: 'done', version: 7 });
    expect(res.status).toBe(409);
    expect(res.json.error.details).toEqual({ currentVersion: 1 });
  });

  it('rejects a stale version with 409', async () => {
    const res = await transition(TODO, { to: 'in_progress', version: 2 });
    expect(res.status).toBe(409);
    expect(res.json.error).toMatchObject({ code: 'conflict', details: { currentVersion: 1 } });
    expect((await ctx.request('GET', `/api/tasks/${TODO}`, { as: 'bob' })).json.status).toBe(
      'todo',
    );
  });

  it.each([
    [{ to: 'archived', version: 1 }, 'to'],
    [{ to: 'done' }, 'version'],
    [{ version: 1 }, 'to'],
  ])('validates the body %j', async (body, field) => {
    const res = await transition(IN_REVIEW, body);
    expect(res.status).toBe(400);
    expect(res.json.error.details.fieldErrors[field]).toBeDefined();
  });

  it('returns 404 for archived and unknown tasks', async () => {
    expect((await transition(seedTaskId(19), { to: 'in_progress', version: 2 })).status).toBe(404);
    expect((await transition('nope', { to: 'in_progress', version: 1 })).status).toBe(404);
  });
});
