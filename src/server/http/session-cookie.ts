// Demo authentication: the session cookie holds a user id signed with HMAC-SHA256.
//   cookie value = "<userId>.<base64url(hmac(secret, userId))>"
// There are no passwords; POST /api/session lets you pick one of the seeded demo users.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'tf_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Used when SESSION_SECRET is not set. Fine for a local demo; set SESSION_SECRET elsewhere. */
export const DEV_SESSION_SECRET = 'taskforge-dev-session-secret';

export function getSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.SESSION_SECRET || DEV_SESSION_SECRET;
}

function sign(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(userId).digest('base64url');
}

export function encodeSession(userId: string, secret: string): string {
  return `${userId}.${sign(userId, secret)}`;
}

/** Returns the user id if the cookie value carries a valid signature, otherwise null. */
export function decodeSession(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;
  const userId = value.slice(0, separator);
  const given = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(sign(userId, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}

/** Reads one cookie from a `Cookie` request header. */
export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function cookieAttributes(secure: boolean): string {
  return `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function sessionSetCookie(userId: string, secret: string, secure: boolean): string {
  const value = encodeURIComponent(encodeSession(userId, secret));
  return `${SESSION_COOKIE}=${value}; ${cookieAttributes(secure)}; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function sessionClearCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(secure)}; Max-Age=0`;
}
