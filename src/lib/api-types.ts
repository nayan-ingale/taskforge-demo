// The JSON wire contract of the HTTP API. The server serializes to these shapes
// (src/server/services/dto.ts) and the browser client (src/lib/api-client.ts) consumes them.
import type { TaskPriority, TaskStatus, UserRole } from '@/domain/enums';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  createdAt: string; // ISO 8601 timestamp
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: string | null; // YYYY-MM-DD
  estimateHours: number | null;
  version: number;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}

/** A page of results. `page` is 1-based; `totalPages` is 0 when `total` is 0. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListResponse<T> {
  items: T[];
}

export interface Dashboard {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  /** Tasks whose due date is before today (UTC) and whose status is not `done`. */
  overdue: number;
}

export interface SessionResponse {
  user: User;
}

export type ErrorCode =
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'conflict'
  | 'invalid_transition'
  | 'internal_error';

/** Every error response has exactly this shape. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/** `details` of a `validation_failed` error. */
export interface ValidationDetails {
  fieldErrors: Record<string, string[]>;
  formErrors: string[];
}

export interface TaskListQuery {
  status?: TaskStatus;
  priority?: TaskPriority;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateTaskBody {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  estimateHours?: number | null;
}

export type UpdateTaskBody = Partial<CreateTaskBody> & { version: number };
