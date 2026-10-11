'use client';

// The /tasks/[id] screen: edit form (PATCH with optimistic concurrency), status transition
// buttons (only legal ones, from src/domain/transitions.ts) and archive (admins).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskStatus,
} from '@/domain/enums';
import { can } from '@/domain/permissions';
import { updateTaskSchema } from '@/domain/task-validation';
import { allowedTransitions, transitionLabel } from '@/domain/transitions';
import { ApiError, apiClient, errorMessage } from '@/lib/api-client';
import type { Task, UpdateTaskBody, User } from '@/lib/api-types';
import { firstFieldErrors } from '@/lib/form-errors';
import { PriorityBadge, StatusBadge } from './badges';
import {
  dangerButtonClass,
  errorTextClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './styles';

export interface TaskDetailProps {
  taskId: string;
  currentUser: User;
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
const FIELDS: readonly Field[] = [
  'title',
  'description',
  'priority',
  'assigneeId',
  'dueDate',
  'estimateHours',
];

function valuesFromTask(task: Task): FormValues {
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    assigneeId: task.assigneeId ?? '',
    dueDate: task.dueDate ?? '',
    estimateHours: task.estimateHours === null ? '' : String(task.estimateHours),
  };
}

/** Only the fields the user actually changed, so concurrent edits to other fields are kept. */
function changedFields(task: Task, values: FormValues): Omit<UpdateTaskBody, 'version'> {
  const original = valuesFromTask(task);
  const changes: Omit<UpdateTaskBody, 'version'> = {};
  if (values.title !== original.title) changes.title = values.title;
  if (values.description !== original.description) {
    changes.description = values.description.trim() === '' ? null : values.description;
  }
  if (values.priority !== original.priority) changes.priority = values.priority;
  if (values.assigneeId !== original.assigneeId) changes.assigneeId = values.assigneeId || null;
  if (values.dueDate !== original.dueDate) changes.dueDate = values.dueDate || null;
  if (values.estimateHours !== original.estimateHours) {
    changes.estimateHours =
      values.estimateHours.trim() === '' ? null : Number(values.estimateHours);
  }
  return changes;
}

export function TaskDetail({ taskId, currentUser }: TaskDetailProps) {
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [values, setValues] = useState<FormValues | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const canEdit = can(currentUser.role, 'task:update');
  const canTransition = can(currentUser.role, 'task:transition');
  const canArchive = can(currentUser.role, 'task:archive');

  useEffect(() => {
    let active = true;
    apiClient.getTask(taskId).then(
      (data) => {
        if (!active) return;
        setTask(data);
        setValues(valuesFromTask(data));
        setLoadError(null);
      },
      (error: unknown) => {
        if (active) setLoadError(errorMessage(error));
      },
    );
    apiClient.listUsers().then(
      (data) => {
        if (active) setUsers(data);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [taskId, reloadToken]);

  function reload() {
    setConflict(false);
    setNotice(null);
    setActionError(null);
    setErrors({});
    setReloadToken((value) => value + 1);
  }

  function handleActionError(error: unknown) {
    if (error instanceof ApiError && error.code === 'conflict') {
      setConflict(true);
    } else if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
      setErrors(firstFieldErrors(error.fieldErrors, FIELDS));
    } else {
      setActionError(errorMessage(error));
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task || !values) return;
    setNotice(null);
    setActionError(null);

    const changes = changedFields(task, values);
    if (Object.keys(changes).length === 0) {
      setNotice('No changes to save.');
      return;
    }
    const body: UpdateTaskBody = { version: task.version, ...changes };
    const parsed = updateTaskSchema(new Date()).safeParse(body);
    if (!parsed.success) {
      setErrors(firstFieldErrors(z.flattenError(parsed.error).fieldErrors, FIELDS));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const updated = await apiClient.updateTask(task.id, body);
      setTask(updated);
      setValues(valuesFromTask(updated));
      setNotice('Changes saved.');
    } catch (error) {
      handleActionError(error);
    } finally {
      setBusy(false);
    }
  }

  async function onTransition(to: TaskStatus) {
    if (!task) return;
    setNotice(null);
    setActionError(null);
    setBusy(true);
    try {
      const updated = await apiClient.transitionTask(task.id, to, task.version);
      setTask(updated);
      setNotice(`Status changed to ${STATUS_LABELS[updated.status]}.`);
    } catch (error) {
      handleActionError(error);
    } finally {
      setBusy(false);
    }
  }

  async function onArchive() {
    if (!task) return;
    setBusy(true);
    try {
      await apiClient.archiveTask(task.id);
      router.push(`/projects/${task.projectId}`);
    } catch (error) {
      handleActionError(error);
      setBusy(false);
      setConfirmArchive(false);
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-red-700">{loadError}</p>
        <Link href="/projects" className="text-indigo-700 hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }
  if (!task || !values) {
    return (
      <p role="status" className="text-sm text-slate-500">
        Loading task…
      </p>
    );
  }

  const assigneeName = users.find((user) => user.id === task.assigneeId)?.name;

  function fieldProps(field: Field) {
    const id = `edit-task-${field}`;
    return {
      id,
      name: field,
      disabled: !canEdit || busy,
      'aria-invalid': errors[field] ? true : undefined,
      'aria-describedby': errors[field] ? `${id}-error` : undefined,
    };
  }
  function fieldError(field: Field) {
    return errors[field] ? (
      <p id={`edit-task-${field}-error`} className={errorTextClass}>
        {errors[field]}
      </p>
    ) : null;
  }
  function update<K extends Field>(field: K, value: FormValues[K]) {
    setValues((previous) => (previous ? { ...previous, [field]: value } : previous));
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/projects/${task.projectId}`}
          className="text-sm text-indigo-700 hover:underline"
        >
          ← Back to project
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{task.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          <span>Assignee: {task.assigneeId ? (assigneeName ?? 'Unknown user') : 'Unassigned'}</span>
          <span>· Version {task.version}</span>
        </div>
      </div>

      {conflict && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="text-amber-900">
            This task was changed by someone else since you opened it. Reload to see the latest
            version (your unsaved edits will be discarded).
          </p>
          <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={reload}>
            Reload task
          </button>
        </div>
      )}
      {actionError && (
        <p role="alert" className="text-sm text-red-700">
          {actionError}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}

      {canTransition && (
        <section aria-labelledby="status-actions-heading" className="space-y-2">
          <h2 id="status-actions-heading" className="text-sm font-semibold text-slate-700">
            Change status
          </h2>
          <div className="flex flex-wrap gap-2">
            {allowedTransitions(task.status).map((to) => (
              <button
                key={to}
                type="button"
                className={secondaryButtonClass}
                disabled={busy}
                onClick={() => void onTransition(to)}
              >
                {transitionLabel(task.status, to)}
              </button>
            ))}
          </div>
        </section>
      )}

      <form
        aria-labelledby="edit-task-heading"
        noValidate
        onSubmit={(event) => void onSave(event)}
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 id="edit-task-heading" className="text-lg font-semibold text-slate-900">
          {canEdit ? 'Edit task' : 'Details'}
        </h2>
        <div>
          <label htmlFor="edit-task-title" className={labelClass}>
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
          <label htmlFor="edit-task-description" className={labelClass}>
            Description
          </label>
          <textarea
            {...fieldProps('description')}
            rows={4}
            className={inputClass}
            value={values.description}
            onChange={(event) => update('description', event.target.value)}
          />
          {fieldError('description')}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-task-priority" className={labelClass}>
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
            <label htmlFor="edit-task-assigneeId" className={labelClass}>
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
            <label htmlFor="edit-task-dueDate" className={labelClass}>
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
            <label htmlFor="edit-task-estimateHours" className={labelClass}>
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
        {canEdit && (
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            Save changes
          </button>
        )}
      </form>

      {canArchive && (
        <section aria-labelledby="danger-zone-heading" className="space-y-2">
          <h2 id="danger-zone-heading" className="text-sm font-semibold text-slate-700">
            Archive
          </h2>
          {confirmArchive ? (
            <div className="flex gap-2">
              <button
                type="button"
                className={dangerButtonClass}
                disabled={busy}
                onClick={() => void onArchive()}
              >
                Confirm archive
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={busy}
                onClick={() => setConfirmArchive(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={dangerButtonClass}
              disabled={busy}
              onClick={() => setConfirmArchive(true)}
            >
              Archive task
            </button>
          )}
        </section>
      )}
    </div>
  );
}
