import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/domain/enums';
import { ACTIONS, can, type Action } from '@/domain/permissions';

const EXPECTED: Record<UserRole, readonly Action[]> = {
  viewer: ['project:read', 'task:read'],
  member: ['project:read', 'task:read', 'task:create', 'task:update', 'task:transition'],
  admin: [...ACTIONS],
};

describe('role permissions', () => {
  const matrix = USER_ROLES.flatMap((role) => ACTIONS.map((action) => [role, action] as const));

  it.each(matrix)('%s may %s only if granted', (role, action) => {
    expect(can(role, action)).toBe(EXPECTED[role].includes(action));
  });

  it('viewer is read-only', () => {
    expect(ACTIONS.filter((action) => can('viewer', action))).toEqual([
      'project:read',
      'task:read',
    ]);
  });

  it('only admins archive tasks and create projects', () => {
    expect(USER_ROLES.filter((role) => can(role, 'task:archive'))).toEqual(['admin']);
    expect(USER_ROLES.filter((role) => can(role, 'project:create'))).toEqual(['admin']);
  });
});
