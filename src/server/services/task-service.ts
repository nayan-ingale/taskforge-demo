// Task use cases. Each function: authorize -> load (404) -> validate (400) -> business rules
// (409 version conflict, 422 invalid transition) -> persist -> return wire DTO.
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/domain/enums';
import { toDateString } from '@/domain/dates';
import { isUuid } from '@/domain/ids';
import {
  createTaskSchema,
  listTasksQuerySchema,
  transitionTaskSchema,
  updateTaskSchema,
} from '@/domain/task-validation';
import { allowedTransitions, canTransition } from '@/domain/transitions';
import type { Dashboard, Page, Task } from '@/lib/api-types';
import type { ProjectRow, TaskRow } from '../db/schema';
import { conflict, invalidTransition, notFound, parseOrThrow, validationFailed } from '../errors';
import { findProjectById } from '../repositories/project-repository';
import {
  archiveTask as archiveTaskRow,
  countTasks,
  countTasksByStatusAndPriority,
  findVisibleTaskById,
  insertTask,
  listTasks,
  updateTaskIfVersion,
  type TaskChanges,
} from '../repositories/task-repository';
import { findUserById } from '../repositories/user-repository';
import { authorize, type ServiceContext } from './context';
import { toTaskDto } from './dto';

async function requireProject(ctx: ServiceContext, projectId: string): Promise<ProjectRow> {
  const project = isUuid(projectId) ? await findProjectById(ctx.db, projectId) : undefined;
  if (!project) throw notFound('Project not found');
  return project;
}

/** Loads a task that exists and is not archived, or throws 404. */
async function requireVisibleTask(ctx: ServiceContext, taskId: string): Promise<TaskRow> {
  const task = isUuid(taskId) ? await findVisibleTaskById(ctx.db, taskId) : undefined;
  if (!task) throw notFound('Task not found');
  return task;
}

async function assertAssigneeExists(ctx: ServiceContext, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  if (!(await findUserById(ctx.db, assigneeId))) {
    throw validationFailed('Validation failed', {
      fieldErrors: { assigneeId: ['Assignee does not exist'] },
      formErrors: [],
    });
  }
}

function versionConflict(currentVersion: number) {
  return conflict('This task was changed by someone else. Reload it and try again.', {
    currentVersion,
  });
}

/** Applies a versioned update; distinguishes "archived meanwhile" (404) from "stale" (409). */
async function saveWithVersion(
  ctx: ServiceContext,
  taskId: string,
  expectedVersion: number,
  changes: TaskChanges,
): Promise<Task> {
  const updated = await updateTaskIfVersion(ctx.db, taskId, expectedVersion, changes, ctx.now());
  if (updated) return toTaskDto(updated);
  const latest = await requireVisibleTask(ctx, taskId);
  throw versionConflict(latest.version);
}

/** GET /api/projects/:id/tasks */
export async function listProjectTasks(
  ctx: ServiceContext,
  projectId: string,
  query: Record<string, string>,
): Promise<Page<Task>> {
  authorize(ctx, 'task:read');
  await requireProject(ctx, projectId);
  const { page, pageSize, status, priority, q } = parseOrThrow(listTasksQuerySchema, query);
  const filter = { projectId, status, priority, q };
  const total = await countTasks(ctx.db, filter);
  const rows = await listTasks(ctx.db, filter, { limit: pageSize, offset: (page - 1) * pageSize });
  return {
    items: rows.map(toTaskDto),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** GET /api/projects/:id/dashboard — same visibility rules as the list. */
export async function getProjectDashboard(
  ctx: ServiceContext,
  projectId: string,
): Promise<Dashboard> {
  authorize(ctx, 'task:read');
  await requireProject(ctx, projectId);
  const rows = await countTasksByStatusAndPriority(ctx.db, projectId, toDateString(ctx.now()));

  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<
    TaskStatus,
    number
  >;
  const byPriority = Object.fromEntries(TASK_PRIORITIES.map((p) => [p, 0])) as Record<
    TaskPriority,
    number
  >;
  let total = 0;
  let overdue = 0;
  for (const row of rows) {
    byStatus[row.status] += row.total;
    byPriority[row.priority] += row.total;
    total += row.total;
    overdue += row.overdue;
  }
  return { total, byStatus, byPriority, overdue };
}

/** GET /api/tasks/:id */
export async function getTask(ctx: ServiceContext, taskId: string): Promise<Task> {
  authorize(ctx, 'task:read');
  return toTaskDto(await requireVisibleTask(ctx, taskId));
}

/** POST /api/projects/:id/tasks */
export async function createTask(
  ctx: ServiceContext,
  projectId: string,
  body: unknown,
): Promise<Task> {
  authorize(ctx, 'task:create');
  await requireProject(ctx, projectId);
  const input = parseOrThrow(createTaskSchema(ctx.now()), body);
  await assertAssigneeExists(ctx, input.assigneeId);

  const now = ctx.now();
  const row = await insertTask(ctx.db, {
    projectId,
    title: input.title,
    description: input.description ?? null,
    status: 'todo',
    priority: input.priority ?? 'medium',
    assigneeId: input.assigneeId ?? null,
    dueDate: input.dueDate ?? null,
    estimateHours: input.estimateHours ?? null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  return toTaskDto(row);
}

/**
 * PATCH /api/tasks/:id — partial update. Omitted fields are unchanged, `null` clears a nullable
 * field, `version` must match the stored version (else 409).
 */
export async function updateTask(
  ctx: ServiceContext,
  taskId: string,
  body: unknown,
): Promise<Task> {
  authorize(ctx, 'task:update');
  const current = await requireVisibleTask(ctx, taskId);
  const input = parseOrThrow(updateTaskSchema(ctx.now()), body);

  const changes: TaskChanges = {};
  if (input.title !== undefined) changes.title = input.title;
  if (input.description !== undefined) changes.description = input.description;
  if (input.priority !== undefined) changes.priority = input.priority;
  if (input.assigneeId !== undefined) changes.assigneeId = input.assigneeId;
  if (input.dueDate !== undefined) changes.dueDate = input.dueDate;
  if (input.estimateHours !== undefined) changes.estimateHours = input.estimateHours;
  if (Object.keys(changes).length === 0) {
    throw validationFailed('Provide at least one field to update', {
      fieldErrors: {},
      formErrors: ['Provide at least one field to update'],
    });
  }
  await assertAssigneeExists(ctx, changes.assigneeId);

  if (input.version !== current.version) throw versionConflict(current.version);
  return saveWithVersion(ctx, taskId, input.version, changes);
}

/** POST /api/tasks/:id/transition — the only way to change a task's status. */
export async function transitionTask(
  ctx: ServiceContext,
  taskId: string,
  body: unknown,
): Promise<Task> {
  authorize(ctx, 'task:transition');
  const current = await requireVisibleTask(ctx, taskId);
  const { to, version } = parseOrThrow(transitionTaskSchema, body);

  if (version !== current.version) throw versionConflict(current.version);
  if (!canTransition(current.status, to)) {
    throw invalidTransition(`A task cannot move from ${current.status} to ${to}`, {
      from: current.status,
      to,
      allowed: allowedTransitions(current.status),
    });
  }
  return saveWithVersion(ctx, taskId, version, { status: to });
}

/** DELETE /api/tasks/:id — archives (soft-deletes) the task. Admin only. */
export async function archiveTask(ctx: ServiceContext, taskId: string): Promise<void> {
  authorize(ctx, 'task:archive');
  const archived = isUuid(taskId) ? await archiveTaskRow(ctx.db, taskId, ctx.now()) : undefined;
  if (!archived) throw notFound('Task not found');
}
