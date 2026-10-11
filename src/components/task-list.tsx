'use client';

// Paginated, filterable task list for one project.
// States (mutually exclusive): loading -> error (with Retry) | empty | table.
// Data comes from GET /api/projects/:id/tasks via apiClient.listTasks.
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '@/domain/enums';
import { DEFAULT_PAGE_SIZE } from '@/domain/task-validation';
import { apiClient, errorMessage } from '@/lib/api-client';
import type { Page, Task, User } from '@/lib/api-types';
import { PriorityBadge, StatusBadge } from './badges';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from './styles';

export interface TaskListProps {
  projectId: string;
  /** Change this value to force a reload (e.g. after a task was created elsewhere on the page). */
  refreshKey?: number;
  /** Tasks per page (1-50). */
  pageSize?: number;
  /** Used to show assignee names; unknown ids are shown as "Unknown user". */
  users?: User[];
}

type LoadResult = { key: string; data: Page<Task> } | { key: string; error: string };

export function TaskList({
  projectId,
  refreshKey = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  users = [],
}: TaskListProps) {
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  // Identifies the request the UI currently wants. The list is "loading" until a result
  // (data or error) for exactly this key has arrived; stale responses are ignored.
  const requestKey = JSON.stringify([
    projectId,
    status,
    priority,
    q,
    page,
    pageSize,
    refreshKey,
    attempt,
  ]);

  useEffect(() => {
    let active = true;
    apiClient
      .listTasks(projectId, {
        status: status || undefined,
        priority: priority || undefined,
        q: q || undefined,
        page,
        pageSize,
      })
      .then(
        (data) => {
          if (active) setResult({ key: requestKey, data });
        },
        (error: unknown) => {
          if (active) setResult({ key: requestKey, error: errorMessage(error) });
        },
      );
    return () => {
      active = false;
    };
  }, [requestKey, projectId, status, priority, q, page, pageSize]);

  const current = result?.key === requestKey ? result : null;
  const userNames = new Map(users.map((user) => [user.id, user.name]));
  const hasFilters = status !== '' || priority !== '' || q !== '';

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQ(searchInput.trim());
    setPage(1);
  }

  return (
    <section aria-labelledby="task-list-heading" className="space-y-4">
      <h2 id="task-list-heading" className="text-lg font-semibold text-slate-900">
        Tasks
      </h2>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="task-filter-status" className={labelClass}>
            Status
          </label>
          <select
            id="task-filter-status"
            className={inputClass}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as TaskStatus | '');
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {TASK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="task-filter-priority" className={labelClass}>
            Priority
          </label>
          <select
            id="task-filter-priority"
            className={inputClass}
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value as TaskPriority | '');
              setPage(1);
            }}
          >
            <option value="">All priorities</option>
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <form role="search" onSubmit={onSearch} className="flex items-end gap-2">
          <div>
            <label htmlFor="task-search" className={labelClass}>
              Search
            </label>
            <input
              id="task-search"
              type="search"
              className={inputClass}
              placeholder="Title or description"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <button type="submit" className={secondaryButtonClass}>
            Search
          </button>
        </form>
      </div>

      {current === null ? (
        <p role="status" className="py-8 text-center text-sm text-slate-500">
          Loading tasks…
        </p>
      ) : 'error' in current ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm">
          <p className="text-red-800">Could not load tasks: {current.error}</p>
          <button
            type="button"
            className={`${primaryButtonClass} mt-3`}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      ) : current.data.items.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
          <p>{hasFilters ? 'No tasks match these filters.' : 'No tasks yet.'}</p>
          {page > 1 && (
            <button
              type="button"
              className={`${secondaryButtonClass} mt-3`}
              onClick={() => setPage(1)}
            >
              Back to first page
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Title
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Priority
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Assignee
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Due
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {current.data.items.map((task) => (
                  <tr key={task.id}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/tasks/${task.id}`}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {task.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-3 py-2">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {task.assigneeId
                        ? (userNames.get(task.assigneeId) ?? 'Unknown user')
                        : 'Unassigned'}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{task.dueDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
            <p className="text-slate-600">
              Page {current.data.page} of {Math.max(current.data.totalPages, 1)} ·{' '}
              {current.data.total} {current.data.total === 1 ? 'task' : 'tasks'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={page >= current.data.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
