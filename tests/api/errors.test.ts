import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/server/db/client';
import { handle } from '@/server/http/router';
import { PROJECT_IDS } from '../support/fixtures';
import { TEST_SESSION_SECRET, createTestContext, type TestContext } from '../support/harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('one error shape for every status', () => {
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

  it('answers with a generic internal_error body', async () => {
    const { response } = await forcedFailure();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong. Please try again.' },
    });
  });

  it('never leaks SQL, stack traces or the original message', async () => {
    const { response } = await forcedFailure();
    const text = await response.text();
    for (const leak of ['SELECT', 'relation', 'password', 'node_modules', 'Error', 'at /']) {
      expect(text).not.toContain(leak);
    }
  });

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

  it('turns a failure inside a service (after auth) into the same 500', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = await createTestContext();
    try {
      await broken.db.execute('DROP TABLE tasks CASCADE');
      const res = await broken.request('GET', `/api/projects/${PROJECT_IDS.web}/tasks`, {
        as: 'bob',
      });
      expect(res.status).toBe(500);
      expect(res.json).toEqual({
        error: { code: 'internal_error', message: 'Something went wrong. Please try again.' },
      });
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      await broken.close();
    }
  });
});
