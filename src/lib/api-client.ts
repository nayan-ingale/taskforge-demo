// The only way browser code talks to the API. Every method resolves with the wire DTO from
// src/lib/api-types.ts or rejects with an ApiError (non-2xx response or network failure).
import type {
  CreateTaskBody,
  Dashboard,
  ListResponse,
  Page,
  Project,
  SessionResponse,
  Task,
  TaskListQuery,
  UpdateTaskBody,
  User,
  ValidationDetails,
} from './api-types';
import type { TaskStatus } from '@/domain/enums';

export class ApiError extends Error {
  readonly status: number;
  /** API error code (see ErrorCode in api-types.ts), or 'network_error' when no response arrived. */
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Per-field messages of a 400 validation_failed error (empty otherwise). */
  get fieldErrors(): Partial<Record<string, string[]>> {
    if (this.code !== 'validation_failed' || !this.details || typeof this.details !== 'object') {
      return {};
    }
    return (this.details as Partial<ValidationDetails>).fieldErrors ?? {};
  }
}

type ErrorBody = { error: { code: string; message: string; details?: unknown } };

function isErrorBody(value: unknown): value is ErrorBody {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const { error } = value;
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection.');
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isErrorBody(data)) {
      throw new ApiError(response.status, data.error.code, data.error.message, data.error.details);
    }
    throw new ApiError(response.status, 'internal_error', `Request failed (${response.status})`);
  }
  return data as T;
}

function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

const enc = encodeURIComponent;

export const apiClient = {
  getSession: () => request<SessionResponse>('GET', '/api/session'),
  logIn: (userId: string) => request<SessionResponse>('POST', '/api/session', { userId }),
  logOut: () => request<void>('DELETE', '/api/session'),

  listUsers: async () => (await request<ListResponse<User>>('GET', '/api/users')).items,

  listProjects: async () => (await request<ListResponse<Project>>('GET', '/api/projects')).items,
  getProject: (projectId: string) => request<Project>('GET', `/api/projects/${enc(projectId)}`),
  getDashboard: (projectId: string) =>
    request<Dashboard>('GET', `/api/projects/${enc(projectId)}/dashboard`),

  listTasks: (projectId: string, query: TaskListQuery = {}) =>
    request<Page<Task>>('GET', withQuery(`/api/projects/${enc(projectId)}/tasks`, { ...query })),
  createTask: (projectId: string, body: CreateTaskBody) =>
    request<Task>('POST', `/api/projects/${enc(projectId)}/tasks`, body),
  getTask: (taskId: string) => request<Task>('GET', `/api/tasks/${enc(taskId)}`),
  updateTask: (taskId: string, body: UpdateTaskBody) =>
    request<Task>('PATCH', `/api/tasks/${enc(taskId)}`, body),
  transitionTask: (taskId: string, to: TaskStatus, version: number) =>
    request<Task>('POST', `/api/tasks/${enc(taskId)}/transition`, { to, version }),
  archiveTask: (taskId: string) => request<void>('DELETE', `/api/tasks/${enc(taskId)}`),
};

export type ApiClient = typeof apiClient;

/** A user-facing message for any error thrown by the client. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
