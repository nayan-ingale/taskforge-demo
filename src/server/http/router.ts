// The HTTP API, independent of any web framework: (Request, deps) -> Response.
// Next.js mounts it at src/app/api/[...path]/route.ts; tests call it directly through
// tests/support/harness.ts. The route table below is the complete list of endpoints.
//
// Request pipeline: match route (404 / 405) -> resolve session cookie -> 401 if the route needs
// a user -> handler (parse JSON, call a service) -> Response. Every thrown error is converted by
// toErrorResponse(): AppError -> its status + { error: { code, message, details? } },
// anything else -> generic 500 (logged server-side, never leaked).
import type { Db } from '../db/client';
import type { UserRow } from '../db/schema';
import { notFound, unauthorized, validationFailed } from '../errors';
import { findUserById } from '../repositories/user-repository';
import type { ServiceContext } from '../services/context';
import { toUserDto } from '../services/dto';
import { createProject, getProject, listProjects } from '../services/project-service';
import {
  archiveTask,
  createTask,
  getProjectDashboard,
  getTask,
  listProjectTasks,
  transitionTask,
  updateTask,
} from '../services/task-service';
import { listUsers, logIn } from '../services/user-service';
import { isUuid } from '@/domain/ids';
import { errorBody, jsonResponse, noContent, toErrorResponse } from './respond';
import {
  SESSION_COOKIE,
  decodeSession,
  getSessionSecret,
  readCookie,
  sessionClearCookie,
  sessionSetCookie,
} from './session-cookie';

export interface RouterDeps {
  db: Db;
  /** Clock used for timestamps, "today" (due-date validation, overdue). Defaults to real time. */
  now?: () => Date;
  /** HMAC secret for the session cookie. Defaults to SESSION_SECRET or the dev secret. */
  sessionSecret?: string;
  /** Receives unexpected (500) errors. Defaults to console.error. */
  logError?: (error: unknown) => void;
}

interface ResolvedDeps {
  db: Db;
  now: () => Date;
  sessionSecret: string;
  logError: (error: unknown) => void;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** `/api/tasks/:taskId/transition` -> `{ taskId: string }` */
type PathParams<Path extends string> = Path extends `${string}:${infer Param}/${infer Rest}`
  ? { [K in Param]: string } & PathParams<`/${Rest}`>
  : Path extends `${string}:${infer Param}`
    ? { [K in Param]: string }
    : Record<never, never>;

interface PublicContext<Params> {
  request: Request;
  url: URL;
  params: Params;
  deps: ResolvedDeps;
  user: UserRow | null;
}

interface AuthenticatedContext<Params> extends PublicContext<Params> {
  user: UserRow;
  /** Database, clock and actor for service calls. */
  services: ServiceContext;
}

interface Route {
  method: Method;
  segments: string[];
  requiresUser: boolean;
  handler: (ctx: PublicContext<Record<string, string>>) => Promise<Response>;
}

/** A route that requires a signed-in user (401 otherwise). */
function route<Path extends string>(
  method: Method,
  path: Path,
  handler: (ctx: AuthenticatedContext<PathParams<Path>>) => Promise<Response>,
): Route {
  return {
    method,
    segments: path.split('/'),
    requiresUser: true,
    handler: (ctx) => {
      const user = ctx.user as UserRow;
      const services: ServiceContext = { db: ctx.deps.db, now: ctx.deps.now, actor: user };
      return handler({ ...ctx, user, services, params: ctx.params as PathParams<Path> });
    },
  };
}

/** A route that works without a session. */
function publicRoute<Path extends string>(
  method: Method,
  path: Path,
  handler: (ctx: PublicContext<PathParams<Path>>) => Promise<Response>,
): Route {
  return {
    method,
    segments: path.split('/'),
    requiresUser: false,
    handler: (ctx) => handler({ ...ctx, params: ctx.params as PathParams<Path> }),
  };
}

const routes: Route[] = [
  // --- demo session -----------------------------------------------------------------------
  publicRoute('POST', '/api/session', async ({ request, url, deps }) => {
    const user = await logIn(deps.db, await readJson(request));
    return jsonResponse({ user: toUserDto(user) }, 200, {
      'Set-Cookie': sessionSetCookie(user.id, deps.sessionSecret, isHttps(url)),
    });
  }),
  route('GET', '/api/session', async ({ user }) => jsonResponse({ user: toUserDto(user) })),
  publicRoute('DELETE', '/api/session', async ({ url }) =>
    noContent({ 'Set-Cookie': sessionClearCookie(isHttps(url)) }),
  ),

  // --- users ------------------------------------------------------------------------------
  route('GET', '/api/users', async ({ services }) =>
    jsonResponse({ items: await listUsers(services) }),
  ),

  // --- projects ---------------------------------------------------------------------------
  route('GET', '/api/projects', async ({ services }) =>
    jsonResponse({ items: await listProjects(services) }),
  ),
  route('POST', '/api/projects', async ({ services, request }) =>
    jsonResponse(await createProject(services, await readJson(request)), 201),
  ),
  route('GET', '/api/projects/:projectId', async ({ services, params }) =>
    jsonResponse(await getProject(services, params.projectId)),
  ),
  route('GET', '/api/projects/:projectId/tasks', async ({ services, params, url }) =>
    jsonResponse(await listProjectTasks(services, params.projectId, queryToObject(url))),
  ),
  route('POST', '/api/projects/:projectId/tasks', async ({ services, params, request }) =>
    jsonResponse(await createTask(services, params.projectId, await readJson(request)), 201),
  ),
  route('GET', '/api/projects/:projectId/dashboard', async ({ services, params }) =>
    jsonResponse(await getProjectDashboard(services, params.projectId)),
  ),

  // --- tasks ------------------------------------------------------------------------------
  route('GET', '/api/tasks/:taskId', async ({ services, params }) =>
    jsonResponse(await getTask(services, params.taskId)),
  ),
  route('PATCH', '/api/tasks/:taskId', async ({ services, params, request }) =>
    jsonResponse(await updateTask(services, params.taskId, await readJson(request))),
  ),
  route('DELETE', '/api/tasks/:taskId', async ({ services, params }) => {
    await archiveTask(services, params.taskId);
    return noContent();
  }),
  route('POST', '/api/tasks/:taskId/transition', async ({ services, params, request }) =>
    jsonResponse(await transitionTask(services, params.taskId, await readJson(request))),
  ),
];

/** Handles one API request. Never throws: every failure becomes an error Response. */
export async function handle(request: Request, deps: RouterDeps): Promise<Response> {
  const resolved: ResolvedDeps = {
    db: deps.db,
    now: deps.now ?? (() => new Date()),
    sessionSecret: deps.sessionSecret ?? getSessionSecret(),
    logError: deps.logError ?? ((error) => console.error('[api] unexpected error', error)),
  };

  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.replace(/\/+$/, '').split('/');
    const allowedMethods: Method[] = [];

    for (const candidate of routes) {
      const params = matchSegments(candidate.segments, pathSegments);
      if (!params) continue;
      allowedMethods.push(candidate.method);
      if (candidate.method !== request.method) continue;

      const user = await currentUser(request, resolved);
      if (candidate.requiresUser && !user) throw unauthorized();
      return await candidate.handler({ request, url, params, deps: resolved, user });
    }

    if (allowedMethods.length > 0) {
      return jsonResponse(
        errorBody('method_not_allowed', `Method ${request.method} is not allowed here`),
        405,
        { Allow: allowedMethods.join(', ') },
      );
    }
    throw notFound('Route not found');
  } catch (error) {
    return toErrorResponse(error, resolved.logError);
  }
}

function matchSegments(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (const [index, segment] of pattern.entries()) {
    const value = actual[index] ?? '';
    if (segment.startsWith(':')) {
      try {
        params[segment.slice(1)] = decodeURIComponent(value);
      } catch {
        return null; // malformed percent-encoding: treat as no match (404)
      }
    } else if (segment !== value) {
      return null;
    }
  }
  return params;
}

async function currentUser(request: Request, deps: ResolvedDeps): Promise<UserRow | null> {
  const cookie = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  const userId = decodeSession(cookie, deps.sessionSecret);
  if (!userId || !isUuid(userId)) return null;
  return (await findUserById(deps.db, userId)) ?? null;
}

/** Parses a JSON body. An empty body is `undefined` (schemas then report what is missing). */
async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw validationFailed('Request body must be valid JSON', {
      fieldErrors: {},
      formErrors: ['Request body must be valid JSON'],
    });
  }
}

/** First value of each query parameter; empty values are treated as absent. */
function queryToObject(url: URL): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (value !== '' && !(key in query)) query[key] = value;
  }
  return query;
}

function isHttps(url: URL): boolean {
  return url.protocol === 'https:';
}
