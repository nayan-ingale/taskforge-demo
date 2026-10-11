import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USER_IDS, SEED_USERS } from '../support/fixtures';
import { createTestContext, type TestContext } from '../support/harness';

// Logging in and out never writes to the database, so one context serves the whole file.
let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('POST /api/session (demo login)', () => {
  it('signs in as a seeded user and sets an HttpOnly session cookie', async () => {
    const res = await ctx.request('POST', '/api/session', { body: { userId: USER_IDS.bob } });

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ user: SEED_USERS.find((user) => user.id === USER_IDS.bob) });
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toMatch(/^tf_session=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('issues a cookie that authenticates later requests', async () => {
    const login = await ctx.request('POST', '/api/session', { body: { userId: USER_IDS.vera } });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;

    const res = await ctx.request('GET', '/api/session', { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(res.json.user).toMatchObject({ id: USER_IDS.vera, role: 'viewer' });
  });

  it('rejects an unknown user with 400', async () => {
    const res = await ctx.request('POST', '/api/session', {
      body: { userId: '10000000-0000-4000-8000-000000000099' },
    });

    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('validation_failed');
    expect(res.json.error.details.fieldErrors.userId).toEqual(['Unknown user']);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it.each([[{}], [{ userId: 'alice' }], [{ userId: 42 }], [null]])(
    'rejects malformed body %j with 400',
    async (body) => {
      const res = await ctx.request('POST', '/api/session', { body });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('validation_failed');
    },
  );
});

describe('GET /api/session', () => {
  it('returns the current user', async () => {
    const res = await ctx.request('GET', '/api/session', { as: 'alice' });
    expect(res.status).toBe(200);
    expect(res.json.user).toEqual({
      id: USER_IDS.alice,
      name: 'Alice Admin',
      email: 'alice@taskforge.test',
      role: 'admin',
    });
  });

  it('returns 401 without a session', async () => {
    const res = await ctx.request('GET', '/api/session');
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe('unauthorized');
  });

  it('returns 401 for a forged or tampered cookie', async () => {
    const forged = `tf_session=${USER_IDS.alice}.not-a-real-signature`;
    expect((await ctx.request('GET', '/api/session', { headers: { cookie: forged } })).status).toBe(
      401,
    );

    const bobCookie = ctx.cookieFor('bob');
    const tampered = bobCookie.replace(USER_IDS.bob, USER_IDS.alice);
    expect(
      (await ctx.request('GET', '/api/session', { headers: { cookie: tampered } })).status,
    ).toBe(401);
  });
});

describe('DELETE /api/session', () => {
  it('clears the cookie and answers 204', async () => {
    const res = await ctx.request('DELETE', '/api/session', { as: 'bob' });
    expect(res.status).toBe(204);
    expect(res.json).toBeNull();
    expect(res.headers.get('set-cookie')).toMatch(/^tf_session=;.*Max-Age=0/);
  });

  it('is idempotent for anonymous callers', async () => {
    expect((await ctx.request('DELETE', '/api/session')).status).toBe(204);
  });
});
