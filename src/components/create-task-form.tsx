'use client';

// Form to create a task in a project. Validates in the browser with the same zod schema the
// API uses (src/domain/task-validation.ts), then POSTs; server-side field errors are shown inline too.
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { PRIORITY_LABELS, TASK_PRIORITIES, type TaskPriority } from '@/domain/enums';
import { createTaskSchema } from '@/domain/task-validation';
import { ApiError, apiClient, errorMessage } from '@/lib/api-client';
import type { CreateTaskBody, Task, User } from '@/lib/api-types';
import { firstFieldErrors } from '@/lib/form-errors';
import { errorTextClass, inputClass, labelClass, primaryButtonClass } from './styles';

export interface CreateTaskFormProps {
  projectId: string;
  /** Options for the assignee select. */
  users?: User[];
  /** Called with the created task after a successful submit. */
  onCreated?: (task: Task) => void;
}

interface FormValues {
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeId: string;
  dueDate: string;
  estimateHours: string;
}

type Field = keyof FormValues;

const EMPTY_VALUES: FormValues = {
  title: '',
  description: '',
  priority: 'medium',
  assigneeId: '',
  dueDate: '',
  estimateHours: '',
};

function toBody(values: FormValues): CreateTaskBody {
  return {
    title: values.title,
    description: values.description.trim() === '' ? null : values.description,
    priority: values.priority,
    assigneeId: values.assigneeId || null,
    dueDate: values.dueDate || null,
    estimateHours: values.estimateHours.trim() === '' ? null : Number(values.estimateHours),
  };
}

const FIELDS = Object.keys(EMPTY_VALUES) as Field[];

export function CreateTaskForm({ projectId, users = [], onCreated }: CreateTaskFormProps) {
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<Task | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends Field>(field: K, value: FormValues[K]) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setCreated(null);

    const body = toBody(values);
    const parsed = createTaskSchema(new Date()).safeParse(body);
    if (!parsed.success) {
      setErrors(firstFieldErrors(z.flattenError(parsed.error).fieldErrors, FIELDS));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const task = await apiClient.createTask(projectId, body);
      setValues(EMPTY_VALUES);
      setCreated(task);
      onCreated?.(task);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setErrors(firstFieldErrors(error.fieldErrors, FIELDS));
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function fieldProps(field: Field) {
    const id = `create-task-${field}`;
    return {
      id,
      name: field,
      'aria-invalid': errors[field] ? true : undefined,
      'aria-describedby': errors[field] ? `${id}-error` : undefined,
    };
  }

  function fieldError(field: Field) {
    const message = errors[field];
    return message ? (
      <p id={`create-task-${field}-error`} className={errorTextClass}>
        {message}
      </p>
    ) : null;
  }

  return (
    <form
      aria-labelledby="create-task-heading"
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="create-task-heading" className="text-lg font-semibold text-slate-900">
        New task
      </h2>

      <div>
        <label htmlFor="create-task-title" className={labelClass}>
          Title
        </label>
        <input
          {...fieldProps('title')}
          type="text"
          className={inputClass}
          value={values.title}
          onChange={(event) => update('title', event.target.value)}
        />
        {fieldError('title')}
      </div>

      <div>
        <label htmlFor="create-task-description" className={labelClass}>
          Description
        </label>
        <textarea
          {...fieldProps('description')}
          rows={3}
          className={inputClass}
          value={values.description}
          onChange={(event) => update('description', event.target.value)}
        />
        {fieldError('description')}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="create-task-priority" className={labelClass}>
            Priority
          </label>
          <select
            {...fieldProps('priority')}
            className={inputClass}
            value={values.priority}
            onChange={(event) => update('priority', event.target.value as TaskPriority)}
          >
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
          {fieldError('priority')}
        </div>

        <div>
          <label htmlFor="create-task-assigneeId" className={labelClass}>
            Assignee
          </label>
          <select
            {...fieldProps('assigneeId')}
            className={inputClass}
            value={values.assigneeId}
            onChange={(event) => update('assigneeId', event.target.value)}
          >
            <option value="">Unassigned</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          {fieldError('assigneeId')}
        </div>

        <div>
          <label htmlFor="create-task-dueDate" className={labelClass}>
            Due date
          </label>
          <input
            {...fieldProps('dueDate')}
            type="date"
            className={inputClass}
            value={values.dueDate}
            onChange={(event) => update('dueDate', event.target.value)}
          />
          {fieldError('dueDate')}
        </div>

        <div>
          <label htmlFor="create-task-estimateHours" className={labelClass}>
            Estimate (hours)
          </label>
          <input
            {...fieldProps('estimateHours')}
            type="number"
            inputMode="numeric"
            min={0}
            max={200}
            step={1}
            className={inputClass}
            value={values.estimateHours}
            onChange={(event) => update('estimateHours', event.target.value)}
          />
          {fieldError('estimateHours')}
        </div>
      </div>

      {formError && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}
      {created && (
        <p role="status" className="text-sm text-emerald-700">
          Created “{created.title}”.
        </p>
      )}

      <button type="submit" className={primaryButtonClass} disabled={submitting}>
        {submitting ? 'Creating…' : 'Create task'}
      </button>
    </form>
  );
}
