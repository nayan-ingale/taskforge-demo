import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  decodeSession,
  encodeSession,
  readCookie,
  sessionClearCookie,
  sessionSetCookie,
} from '@/server/http/session-cookie';

const USER = '10000000-0000-4000-8000-000000000001';

describe('session cookie signing', () => {
  it('round-trips a user id', () => {
    expect(decodeSession(encodeSession(USER, 'secret'), 'secret')).toBe(USER);
  });

  it('rejects a value signed with another secret', () => {
    expect(decodeSession(encodeSession(USER, 'secret'), 'other-secret')).toBeNull();
  });

  it('rejects a tampered user id or signature', () => {
    const value = encodeSession(USER, 'secret');
    const otherUser = '10000000-0000-4000-8000-000000000002';
    expect(decodeSession(value.replace(USER, otherUser), 'secret')).toBeNull();
    expect(decodeSession(`${value.slice(0, -1)}x`, 'secret')).toBeNull();
  });

  it.each([undefined, '', USER, '.sig', 'no-signature.'])('rejects malformed value %j', (value) => {
    expect(decodeSession(value, 'secret')).toBeNull();
  });
});

describe('cookie headers', () => {
  it('reads one cookie out of a Cookie header', () => {
    expect(readCookie(`a=1; ${SESSION_COOKIE}=abc.def; b=2`, SESSION_COOKIE)).toBe('abc.def');
    expect(readCookie('a=1', SESSION_COOKIE)).toBeUndefined();
    expect(readCookie(null, SESSION_COOKIE)).toBeUndefined();
  });

  it('sets an HttpOnly, SameSite=Lax cookie that is Secure only over https', () => {
    const cookie = sessionSetCookie(USER, 'secret', false);
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');
    expect(sessionSetCookie(USER, 'secret', true)).toContain('Secure');
  });

  it('clears the cookie with Max-Age=0', () => {
    expect(sessionClearCookie(false)).toMatch(new RegExp(`^${SESSION_COOKIE}=;.*Max-Age=0`));
  });
});
