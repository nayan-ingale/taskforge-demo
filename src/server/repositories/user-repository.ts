// Data access for users.
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { users, type UserRow } from '../db/schema';

export async function findUserById(db: Db, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function listUsers(db: Db): Promise<UserRow[]> {
  return db.select().from(users).orderBy(asc(users.name), asc(users.id));
}
