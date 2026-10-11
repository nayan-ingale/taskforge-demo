// Helpers for component tests. Components talk to the API only through `fetch` (via
// src/lib/api-client.ts) using relative `/api/...` URLs, so tests stub the global fetch.
import { vi, type Mock } from 'vitest';
import type { Page, Task } from '@/lib/api-types';
import { PROJECT_IDS } from './fixtures';

export type FetchMock = Mock<typeof fetch>;

/** Replaces global fetch for the current test (restored automatically: unstubGlobals). */
export function mockFetch(): FetchMock {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return jsonResponse(
    { error: details === undefined ? { code, message } : { code, message, details } },
    status,
  );
}

/** Parses a fetch input (relative URLs resolve against http://localhost). */
export function toUrl(input: RequestInfo | URL): URL {
  if (input instanceof Request) return new URL(input.url);
  return new URL(input instanceof URL ? input.href : input, 'http://localhost');
}

export interface RecordedRequest {
  method: string;
  url: URL;
  /** Parsed JSON body, or undefined. */
  body: unknown;
}

/** Every call made to the mock so far, in order. */
export function requests(fetchMock: FetchMock): RecordedRequest[] {
  return fetchMock.mock.calls.map(([input, init]) => ({
    method: init?.method ?? 'GET',
    url: toUrl(input),
    body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
  }));
}

/** URL of the n-th fetch call. */
export function requestedUrl(fetchMock: FetchMock, call = 0): URL {
  const request = requests(fetchMock)[call];
  if (!request) throw new Error(`fetch was not called ${call + 1} time(s)`);
  return request.url;
}

/** Method and parsed JSON body of the n-th fetch call. */
export function requestedInit(fetchMock: FetchMock, call = 0): { method: string; body: unknown } {
  const request = requests(fetchMock)[call];
  if (!request) throw new Error(`fetch was not called ${call + 1} time(s)`);
  return { method: request.method, body: request.body };
}

type RouteHandler = (body: unknown) => Response | Promise<Response>;

/**
 * Answers fetch calls by "METHOD /path" (query string ignored), e.g.
 *   routeFetch(fetchMock, { 'GET /api/users': () => jsonResponse({ items: [] }) });
 * Unrouted calls fail the test with a 599 response that names the request.
 */
export function routeFetch(fetchMock: FetchMock, routes: Record<string, RouteHandler>): void {
  fetchMock.mockImplementation(async (input, init) => {
    const url = toUrl(input);
    const method = init?.method ?? 'GET';
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) return errorResponse(599, 'unrouted', `No mock for ${method} ${url.pathname}`);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    return handler(body);
  });
}

/** A promise you resolve or reject later, to hold a component in its loading state. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let counter = 0;

export function makeTask(overrides: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `40000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    projectId: PROJECT_IDS.web,
    title: `Task ${counter}`,
    description: null,
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    dueDate: null,
    estimateHours: null,
    version: 1,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

export function makePage(items: Task[], overrides: Partial<Page<Task>> = {}): Page<Task> {
  const pageSize = overrides.pageSize ?? 10;
  const total = overrides.total ?? items.length;
  return {
    items,
    page: 1,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    ...overrides,
  };
}
