// Role-based permissions. This is the ONLY place that maps roles to allowed actions;
// services call `can()` before doing work and the UI uses it to hide controls.
import type { UserRole } from './enums';

export const ACTIONS = [
  'project:read',
  'project:create',
  'task:read',
  'task:create',
  'task:update',
  'task:transition',
  'task:archive',
] as const;
export type Action = (typeof ACTIONS)[number];

const VIEWER: readonly Action[] = ['project:read', 'task:read'];
const MEMBER: readonly Action[] = [...VIEWER, 'task:create', 'task:update', 'task:transition'];
const ADMIN: readonly Action[] = [...MEMBER, 'task:archive', 'project:create'];

const GRANTS: Readonly<Record<UserRole, readonly Action[]>> = {
  viewer: VIEWER,
  member: MEMBER,
  admin: ADMIN,
};

export function can(role: UserRole, action: Action): boolean {
  return GRANTS[role].includes(action);
}
