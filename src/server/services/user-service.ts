// User and demo-session use cases.
import { createSessionSchema } from '@/domain/session-validation';
import type { User } from '@/lib/api-types';
import type { Db } from '../db/client';
import type { UserRow } from '../db/schema';
import { parseOrThrow, validationFailed } from '../errors';
import { findUserById, listUsers as listUserRows } from '../repositories/user-repository';
import type { ServiceContext } from './context';
import { toUserDto } from './dto';

/** GET /api/users — any signed-in user may list users (e.g. to pick an assignee). */
export async function listUsers(ctx: ServiceContext): Promise<User[]> {
  const rows = await listUserRows(ctx.db);
  return rows.map(toUserDto);
}

/** POST /api/session — demo login: resolves the chosen user or fails with 400. */
export async function logIn(db: Db, body: unknown): Promise<UserRow> {
  const { userId } = parseOrThrow(createSessionSchema, body);
  const user = await findUserById(db, userId);
  if (!user) {
    throw validationFailed('Validation failed', {
      fieldErrors: { userId: ['Unknown user'] },
      formErrors: [],
    });
  }
  return user;
}
