// Data access for tasks.
//
// Visibility rule: a task is visible when it belongs to the project and is NOT archived.
// `visibleTasksWhere()` is the only place that encodes it; the list, its total count and the
// dashboard all build on it, which is what keeps their numbers consistent.
import { and, count, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { TaskPriority, TaskStatus } from '@/domain/enums';
import type { Db } from '../db/client';
import { tasks, type NewTaskRow, type TaskRow } from '../db/schema';

export interface TaskFilter {
  projectId: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  /** Case-insensitive substring match on title or description. */
  q?: string;
}

/** Escapes LIKE/ILIKE wildcards so user input is matched literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function visibleTasksWhere(filter: TaskFilter): SQL {
  const conditions: SQL[] = [eq(tasks.projectId, filter.projectId), isNull(tasks.archivedAt)];
  if (filter.status) conditions.push(eq(tasks.status, filter.status));
  if (filter.priority) conditions.push(eq(tasks.priority, filter.priority));
  if (filter.q) {
    const pattern = `%${escapeLikePattern(filter.q)}%`;
    const search = or(
      sql`${tasks.title} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${tasks.description} ILIKE ${pattern} ESCAPE '\\'`,
    );
    if (search) conditions.push(search);
  }
  return and(...conditions) ?? sql`true`;
}

export async function countTasks(db: Db, filter: TaskFilter): Promise<number> {
  const [row] = await db.select({ total: count() }).from(tasks).where(visibleTasksWhere(filter));
  return row?.total ?? 0;
}

/** One page of visible tasks, newest first; ties on created_at are broken by id (both DESC). */
export async function listTasks(
  db: Db,
  filter: TaskFilter,
  page: { limit: number; offset: number },
): Promise<TaskRow[]> {
  return db
    .select()
    .from(tasks)
    .where(visibleTasksWhere(filter))
    .orderBy(desc(tasks.createdAt), desc(tasks.id))
    .limit(page.limit)
    .offset(page.offset);
}

/** A task by id, or undefined when it does not exist or is archived. */
export async function findVisibleTaskById(db: Db, id: string): Promise<TaskRow | undefined> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.archivedAt)))
    .limit(1);
  return row;
}

export async function insertTask(db: Db, values: NewTaskRow): Promise<TaskRow> {
  const [row] = await db.insert(tasks).values(values).returning();
  if (!row) throw new Error('insert into tasks returned no row');
  return row;
}

export type TaskChanges = Partial<
  Pick<
    TaskRow,
    'title' | 'description' | 'status' | 'priority' | 'assigneeId' | 'dueDate' | 'estimateHours'
  >
>;

/**
 * Optimistic-concurrency update: applies `changes`, bumps `version` and sets `updated_at`, but
 * only if the task is visible and still at `expectedVersion`. Returns undefined otherwise.
 */
export async function updateTaskIfVersion(
  db: Db,
  id: string,
  expectedVersion: number,
  changes: TaskChanges,
  now: Date,
): Promise<TaskRow | undefined> {
  const [row] = await db
    .update(tasks)
    .set({ ...changes, version: sql`${tasks.version} + 1`, updatedAt: now })
    .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion), isNull(tasks.archivedAt)))
    .returning();
  return row;
}

/** Soft-deletes a visible task. Returns undefined when it does not exist or is already archived. */
export async function archiveTask(db: Db, id: string, now: Date): Promise<TaskRow | undefined> {
  const [row] = await db
    .update(tasks)
    .set({ archivedAt: now, updatedAt: now, version: sql`${tasks.version} + 1` })
    .where(and(eq(tasks.id, id), isNull(tasks.archivedAt)))
    .returning();
  return row;
}

export interface TaskCountRow {
  status: TaskStatus;
  priority: TaskPriority;
  total: number;
  overdue: number;
}

/**
 * Visible-task counts grouped by status and priority. `overdue` counts tasks due before `today`
 * (YYYY-MM-DD) that are not done.
 */
export async function countTasksByStatusAndPriority(
  db: Db,
  projectId: string,
  today: string,
): Promise<TaskCountRow[]> {
  return db
    .select({
      status: tasks.status,
      priority: tasks.priority,
      total: count(),
      overdue: count(
        sql`CASE WHEN ${tasks.dueDate} < ${today} AND ${tasks.status} <> 'done' THEN 1 END`,
      ),
    })
    .from(tasks)
    .where(visibleTasksWhere({ projectId }))
    .groupBy(tasks.status, tasks.priority);
}
