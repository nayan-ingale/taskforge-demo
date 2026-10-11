// Session lookup for server components (pages and the root layout). API routes do NOT use this;
// the router resolves the session itself (src/server/http/router.ts).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { isUuid } from '@/domain/ids';
import type { User } from '@/lib/api-types';
import { getAppDb } from './db/app-db';
import { SESSION_COOKIE, decodeSession, getSessionSecret } from './http/session-cookie';
import { findUserById } from './repositories/user-repository';
import { toUserDto } from './services/dto';

/** The signed-in user for this request, or null. Cached per request. */
export const getPageUser = cache(async (): Promise<User | null> => {
  const cookieStore = await cookies();
  const userId = decodeSession(cookieStore.get(SESSION_COOKIE)?.value, getSessionSecret());
  if (!userId || !isUuid(userId)) return null;
  const row = await findUserById(getAppDb(), userId);
  return row ? toUserDto(row) : null;
});

/** The signed-in user; redirects to /login when there is none. */
export async function requirePageUser(): Promise<User> {
  const user = await getPageUser();
  if (!user) redirect('/login');
  return user;
}
