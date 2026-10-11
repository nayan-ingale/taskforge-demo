// Row -> wire-format serializers. Timestamps become ISO strings; internal columns
// (e.g. archived_at) are never sent to clients.
import type { Project, Task, User } from '@/lib/api-types';
import type { ProjectRow, TaskRow, UserRow } from '../db/schema';

export function toUserDto(row: UserRow): User {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export function toProjectDto(row: ProjectRow): Project {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTaskDto(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assigneeId,
    dueDate: row.dueDate,
    estimateHours: row.estimateHours,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
