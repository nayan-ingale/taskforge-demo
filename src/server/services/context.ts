// Everything a service needs: the database, the clock and the authenticated user.
import { can, type Action } from '@/domain/permissions';
import type { Db } from '../db/client';
import type { UserRow } from '../db/schema';
import { forbidden } from '../errors';

export interface ServiceContext {
  db: Db;
  now: () => Date;
  actor: UserRow;
}

/** Throws 403 unless the actor's role allows `action` (see src/domain/permissions.ts). */
export function authorize(ctx: ServiceContext, action: Action): void {
  if (!can(ctx.actor.role, action)) throw forbidden();
}
