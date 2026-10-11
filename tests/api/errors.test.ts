import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/server/db/client';
import { handle } from '@/server/http/router';
import { PROJECT_IDS, seedTaskId } from '../support/fixtures';
import { TEST_SESSION_SECRET, createTestContext, type TestContext } from '../support/harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

function expectErrorShape(json: unknown, code: string) {
  expect(json).toEqual({
    error: expect.objectContaining({ code, message: expect.any(String) }),
  });
  const keys = Object.keys((json as { error: object }).error).sort();
  expect(['code,message', 'code,details,message']).toContain(keys.join(','));
}

describe('one error shape for every status', () => {
  it.each([
    [
      '400',
      'POST',
      `/api/projects/${PROJECT_IDS.web}/tasks`,
      'bob',
      { title: '' },
      400,
      'validation_failed',
    ],
    ['401', 'GET', '/api/projects', undefined, undefined, 401, 'unauthorized'],
    ['403', 'DELETE', `/api/tasks/${seedTaskId(5)}`, 'vera', undefined, 403, 'forbidden'],
    [
      '404',
      'GET',
      '/api/tasks/30000000-0000-4000-8000-000000000999',
      'bob',
      undefined,
      404,
      'not_found',
    ],
    ['405', 'PUT', '/api/projects', 'bob', {}, 405, 'method_not_allowed'],
    [
      '409',
      'PATCH',
      `/api/tasks/${seedTaskId(5)}`,
      'bob',
      { version: 99, title: 'Stale' },
      409,
      'conflict',
    ],
    [
      '422',
      'POST',
      `/api/tasks/${seedTaskId(5)}/transition`,
      'bob',
      { to: 'done', version: 1 },
      422,
      'invalid_transition',
    ],
  ] as const)('%s', async (_label, method, path, as, body, status, code) => {
    const res = await ctx.request(method, path, { as, body });
    expect(res.status).toBe(status);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expectErrorShape(res.json, code);
  });

  it('includes field details only for validation errors', async () => {
    const res = await ctx.request('POST', `/api/projects/${PROJECT_IDS.web}/tasks`, {
      as: 'bob',
      body: { title: '' },
    });
    expect(res.json.error.details).toEqual({
      fieldErrors: { title: ['Title must be at least 3 characters'] },
      formErrors: [],
    });
  });
});

describe('routing errors', () => {
  it.each(['/api/nope', '/api/projects/x/y/z', '/api/tasks'])(
    'unknown route %s -> 404',
    async (path) => {
      const res = await ctx.request('GET', path, { as: 'bob' });
      expect(res.status).toBe(404);
      expect(res.json).toEqual({ error: { code: 'not_found', message: 'Route not found' } });
    },
  );

  it('lists the allowed methods on 405', async () => {
    const res = await ctx.request('DELETE', `/api/projects/${PROJECT_IDS.web}/tasks`, {
      as: 'alice',
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
  });

  it('ignores a trailing slash', async () => {
    const res = await ctx.request('GET', '/api/projects/', { as: 'bob' });
    expect(res.status).toBe(200);
  });

  it('marks API responses as not cacheable', async () => {
    const ok = await ctx.request('GET', '/api/projects', { as: 'bob' });
    const error = await ctx.request('GET', '/api/projects');
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(error.headers.get('cache-control')).toBe('no-store');
  });
});

describe('unexpected errors (500)', () => {
  const SECRET_DETAIL =
    'relation "tasks" does not exist: SELECT * FROM tasks WHERE password_hash = $1 at /srv/app/node_modules/pg/lib/client.js:526:17';

  /** A database whose every query fails with an error that contains sensitive internals. */
  function explodingDb(): Db {
    const fail = () => {
      throw new Error(SECRET_DETAIL);
    };
    return new Proxy({} as Db, { get: () => fail });
  }

  async function forcedFailure() {
    const logError = vi.fn();
    const request = new Request(`http://localhost/api/projects/${PROJECT_IDS.web}/tasks`, {
      headers: { cookie: ctx.cookieFor('bob') },
    });
    const response = await handle(request, {
      db: explodingDb(),
      logError,
      sessionSecret: TEST_SESSION_SECRET,
    });
    return { response, logError };
  }

  it('reports the original error server-side', async () => {
    const { logError } = await forcedFailure();
    expect(logError).toHaveBeenCalledTimes(1);
    expect((logError.mock.calls[0]![0] as Error).message).toBe(SECRET_DETAIL);
  });

  it('logs to console.error by default', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = new Request('http://localhost/api/projects', {
      headers: { cookie: ctx.cookieFor('bob') },
    });
    const response = await handle(request, {
      db: explodingDb(),
      sessionSecret: TEST_SESSION_SECRET,
    });
    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
  });
});
