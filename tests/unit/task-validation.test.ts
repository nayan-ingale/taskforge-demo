import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createTaskSchema,
  listTasksQuerySchema,
  transitionTaskSchema,
  updateTaskSchema,
} from '@/domain/task-validation';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const create = createTaskSchema(NOW);
const update = updateTaskSchema(NOW);

function fieldErrors(schema: z.ZodType, input: unknown): Record<string, string[] | undefined> {
  const result = schema.safeParse(input);
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

describe('createTaskSchema', () => {
  it('accepts a minimal task and trims the title', () => {
    expect(create.parse({ title: '  Ship it  ' })).toEqual({ title: 'Ship it' });
  });

  it('accepts all optional fields', () => {
    const input = {
      title: 'Write docs',
      description: 'Explain the harness',
      priority: 'urgent',
      assigneeId: '10000000-0000-4000-8000-000000000002',
      dueDate: '2026-10-20',
      estimateHours: 200,
    };
    expect(create.parse(input)).toEqual(input);
  });

  it.each([
    ['ab', 'Title must be at least 3 characters'],
    ['   ab   ', 'Title must be at least 3 characters'],
    ['x'.repeat(121), 'Title must be at most 120 characters'],
  ])('rejects title %j', (title, message) => {
    expect(fieldErrors(create, { title }).title).toEqual([message]);
  });

  it('accepts titles of exactly 3 and 120 characters', () => {
    expect(create.safeParse({ title: 'abc' }).success).toBe(true);
    expect(create.safeParse({ title: 'x'.repeat(120) }).success).toBe(true);
  });

  it('requires a title', () => {
    expect(fieldErrors(create, {}).title).toBeDefined();
    expect(fieldErrors(create, { title: null }).title).toBeDefined();
  });

  it('limits description to 2000 characters and stores blank descriptions as null', () => {
    expect(create.safeParse({ title: 'Task', description: 'd'.repeat(2000) }).success).toBe(true);
    expect(
      fieldErrors(create, { title: 'Task', description: 'd'.repeat(2001) }).description,
    ).toEqual(['Description must be at most 2000 characters']);
    expect(create.parse({ title: 'Task', description: '   ' }).description).toBeNull();
    expect(create.parse({ title: 'Task', description: null }).description).toBeNull();
  });

  it('accepts a due date of today or later, or null', () => {
    expect(create.safeParse({ title: 'Task', dueDate: '2026-10-20' }).success).toBe(true);
    expect(create.safeParse({ title: 'Task', dueDate: '2027-01-01' }).success).toBe(true);
    expect(create.safeParse({ title: 'Task', dueDate: null }).success).toBe(true);
  });

  it.each([
    ['2026-10-19', 'Due date cannot be in the past'],
    ['2026-02-30', 'Due date must be a valid date (YYYY-MM-DD)'],
    ['20/10/2026', 'Due date must be a valid date (YYYY-MM-DD)'],
    ['2026-10-20T10:00:00Z', 'Due date must be a valid date (YYYY-MM-DD)'],
  ])('rejects due date %s', (dueDate, message) => {
    expect(fieldErrors(create, { title: 'Task', dueDate }).dueDate).toEqual([message]);
  });

  it('judges "the past" relative to the injected clock', () => {
    const later = createTaskSchema(new Date('2026-12-01T00:00:00Z'));
    expect(later.safeParse({ title: 'Task', dueDate: '2026-11-30' }).success).toBe(false);
    expect(create.safeParse({ title: 'Task', dueDate: '2026-11-30' }).success).toBe(true);
  });

  it.each([
    [-1, 'Estimate cannot be negative'],
    [201, 'Estimate must be at most 200 hours'],
    [1.5, 'Estimate must be a whole number of hours'],
    ['3', 'Estimate must be a number of hours'],
  ])('rejects estimateHours %j', (estimateHours, message) => {
    expect(fieldErrors(create, { title: 'Task', estimateHours }).estimateHours).toEqual([message]);
  });

  it('accepts estimateHours 0, 200 and null', () => {
    for (const estimateHours of [0, 200, null]) {
      expect(create.safeParse({ title: 'Task', estimateHours }).success).toBe(true);
    }
  });

  it('enforces the priority enum', () => {
    expect(fieldErrors(create, { title: 'Task', priority: 'critical' }).priority).toEqual([
      'Priority must be one of: low, medium, high, urgent',
    ]);
  });

  it('requires assigneeId to look like a UUID', () => {
    expect(fieldErrors(create, { title: 'Task', assigneeId: 'bob' }).assigneeId).toEqual([
      'Assignee must be a user id',
    ]);
  });

  it('rejects unknown fields, including status', () => {
    expect(create.safeParse({ title: 'Task', status: 'done' }).success).toBe(false);
    expect(create.safeParse({ title: 'Task', projectId: 'x' }).success).toBe(false);
  });
});

describe('updateTaskSchema', () => {
  it('requires a positive integer version', () => {
    expect(fieldErrors(update, { title: 'New title' }).version).toEqual(['Version is required']);
    expect(fieldErrors(update, { version: 0, title: 'New title' }).version).toBeDefined();
    expect(fieldErrors(update, { version: 1.5, title: 'New title' }).version).toBeDefined();
  });

  it('keeps omitted fields out of the result and keeps explicit nulls', () => {
    expect(update.parse({ version: 3, dueDate: null, assigneeId: null })).toEqual({
      version: 3,
      dueDate: null,
      assigneeId: null,
    });
  });

  it('does not allow clearing the title', () => {
    expect(fieldErrors(update, { version: 1, title: null }).title).toBeDefined();
  });

  it('rejects status changes with a pointer to the transition endpoint', () => {
    expect(fieldErrors(update, { version: 1, status: 'done' }).status).toEqual([
      'Status cannot be changed here; use POST /api/tasks/:id/transition',
    ]);
  });

  it('applies the same field rules as create', () => {
    expect(fieldErrors(update, { version: 1, title: 'no' }).title).toBeDefined();
    expect(fieldErrors(update, { version: 1, dueDate: '2026-10-01' }).dueDate).toEqual([
      'Due date cannot be in the past',
    ]);
    expect(fieldErrors(update, { version: 1, estimateHours: 999 }).estimateHours).toBeDefined();
  });
});

describe('transitionTaskSchema', () => {
  it('requires a known status and a version', () => {
    expect(transitionTaskSchema.safeParse({ to: 'done', version: 1 }).success).toBe(true);
    expect(fieldErrors(transitionTaskSchema, { to: 'closed', version: 1 }).to).toBeDefined();
    expect(fieldErrors(transitionTaskSchema, { to: 'done' }).version).toBeDefined();
  });
});

describe('listTasksQuerySchema', () => {
  it('defaults to page 1 with 10 items', () => {
    expect(listTasksQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
  });

  it('coerces numeric strings and trims the search', () => {
    expect(listTasksQuerySchema.parse({ page: '3', pageSize: '50', q: '  login ' })).toEqual({
      page: 3,
      pageSize: 50,
      q: 'login',
    });
  });

  it('treats a blank search as no search', () => {
    expect(listTasksQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ page: '-1' }, 'page'],
    [{ page: '1.5' }, 'page'],
    [{ page: 'two' }, 'page'],
    [{ pageSize: '0' }, 'pageSize'],
    [{ pageSize: '51' }, 'pageSize'],
    [{ status: 'closed' }, 'status'],
    [{ priority: 'critical' }, 'priority'],
  ])('rejects %j', (query, field) => {
    expect(fieldErrors(listTasksQuerySchema, query)[field]).toBeDefined();
  });
});
