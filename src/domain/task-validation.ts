// Input validation for tasks (create, update, transition, list query).
// Pure zod schemas shared by the API (task-service) and the create form in the browser.
// Rules that depend on "today" are built from an injected clock so tests are deterministic.
import { z } from 'zod';
import { isValidDateString, toDateString } from './dates';
import { TASK_PRIORITIES, TASK_STATUSES } from './enums';
import { UUID_PATTERN } from './ids';
import { NUL_MESSAGE, hasNoNul } from './text';

export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const ESTIMATE_MAX_HOURS = 200;
export const SEARCH_MAX = 200;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

const title = z
  .string({ error: 'Title is required' })
  .min(TITLE_MIN, `Title must be at least ${TITLE_MIN} characters`)
  .max(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters`)
  .refine(hasNoNul, NUL_MESSAGE);

/** Trimmed; an empty or whitespace-only description is stored as `null`. */
const description = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX, `Description must be at most ${DESCRIPTION_MAX} characters`)
  .refine(hasNoNul, NUL_MESSAGE)
  .transform((value) => (value === '' ? null : value))
  .nullable();

const priority = z.enum(TASK_PRIORITIES, {
  error: `Priority must be one of: ${TASK_PRIORITIES.join(', ')}`,
});

const status = z.enum(TASK_STATUSES, {
  error: `Status must be one of: ${TASK_STATUSES.join(', ')}`,
});

const assigneeId = z.string().regex(UUID_PATTERN, 'Assignee must be a user id').nullable();

const estimateHours = z
  .number({ error: 'Estimate must be a number of hours' })
  .int('Estimate must be a whole number of hours')
  .max(ESTIMATE_MAX_HOURS, `Estimate must be at most ${ESTIMATE_MAX_HOURS} hours`)
  .nullable();

const version = z
  .number({ error: 'Version is required' })
  .int('Version must be an integer')
  .min(1, 'Version must be at least 1');

/** A `YYYY-MM-DD` due date that is not before `now` (UTC calendar date). */
function dueDate(now: Date) {
  const today = toDateString(now);
  return z
    .string({ error: 'Due date must be a date (YYYY-MM-DD)' })
    .superRefine((value, ctx) => {
      if (!isValidDateString(value)) {
        ctx.addIssue({ code: 'custom', message: 'Due date must be a valid date (YYYY-MM-DD)' });
      } else if (value < today) {
        ctx.addIssue({ code: 'custom', message: 'Due date cannot be in the past' });
      }
    })
    .nullable();
}

/** Body of `POST /api/projects/:id/tasks`. New tasks always start in `todo`. */
export function createTaskSchema(now: Date) {
  return z.strictObject({
    title,
    description: description.optional(),
    priority: priority.optional(),
    assigneeId: assigneeId.optional(),
    dueDate: dueDate(now).optional(),
    estimateHours: estimateHours.optional(),
  });
}
export type CreateTaskInput = z.infer<ReturnType<typeof createTaskSchema>>;

/**
 * Body of `PATCH /api/tasks/:id`. Omitted fields stay unchanged; `null` clears a nullable field.
 * `version` is required (optimistic concurrency). Status changes must use the transition endpoint.
 */
export function updateTaskSchema(now: Date) {
  return z.strictObject({
    version,
    title: title.optional(),
    description: description.optional(),
    priority: priority.optional(),
    assigneeId: assigneeId.optional(),
    dueDate: dueDate(now).optional(),
    estimateHours: estimateHours.optional(),
    status: z
      .never({ error: 'Status cannot be changed here; use POST /api/tasks/:id/transition' })
      .optional(),
  });
}
export type UpdateTaskInput = z.infer<ReturnType<typeof updateTaskSchema>>;

/** Body of `POST /api/tasks/:id/transition`. */
export const transitionTaskSchema = z.strictObject({ to: status, version });
export type TransitionTaskInput = z.infer<typeof transitionTaskSchema>;

/**
 * Query of `GET /api/projects/:id/tasks`. Values arrive as strings; empty strings mean "not set"
 * (callers should drop them before parsing, see `queryToObject`).
 */
export const listTasksQuerySchema = z.object({
  status: status.optional(),
  priority: priority.optional(),
  q: z
    .string()
    .trim()
    .max(SEARCH_MAX, `Search must be at most ${SEARCH_MAX} characters`)
    .refine(hasNoNul, NUL_MESSAGE)
    .optional()
    .transform((value) => (value ? value : undefined)),
  page: z.coerce
    .number({ error: 'Page must be a number' })
    .int('Page must be a whole number')
    .min(1, 'Page must be at least 1')
    .default(1),
  pageSize: z.coerce
    .number({ error: 'Page size must be a number' })
    .int('Page size must be a whole number')
    .min(1, 'Page size must be at least 1')
    .max(MAX_PAGE_SIZE, `Page size must be at most ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
