# TaskForge

TaskForge is a small full-stack project-management demo app: projects contain tasks that
move through a fixed workflow (to do → in progress → in review → done), with demo login,
role-based permissions, filtering, search, pagination, a per-project dashboard and optimistic
concurrency on edits.

It is the target application for an AI bug-fixing platform, so it is built for clarity and
fast, deterministic, offline tests rather than for features. See [ARCHITECTURE.md](ARCHITECTURE.md)
for a "where is X?" map of the code.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript 6 (strict) · Tailwind CSS 4 ·
Drizzle ORM · PostgreSQL via PGlite (embedded, default) or node-postgres (`DATABASE_URL`) ·
zod 4 · Vitest 5 + Testing Library · Playwright.

## Quick start

Requirements: Node.js 24 and pnpm 10 (`corepack enable` picks up the pinned
`packageManager` version). No Docker and no external database are needed.

```bash
pnpm install
pnpm dev          # migrates + seeds .data/pglite, then serves http://localhost:3000
```

Open http://localhost:3000, pick a demo user and go. `PORT=3100 pnpm dev` changes the port.

| Demo user   | Role   | Can                                                     | Id                                     |
| ----------- | ------ | ------------------------------------------------------- | -------------------------------------- |
| Alice Admin | admin  | everything, incl. archiving tasks and creating projects | `10000000-0000-4000-8000-000000000001` |
| Bob Member  | member | read, create/update tasks, change status                | `10000000-0000-4000-8000-000000000002` |
| Vera Viewer | viewer | read only                                               | `10000000-0000-4000-8000-000000000003` |

Seeded projects: **WEB** "Website Redesign" (`20000000-0000-4000-8000-000000000001`) and
**MOB** "Mobile App" (`20000000-0000-4000-8000-000000000002`), with 30 tasks
(`30000000-0000-4000-8000-0000000000NN`, NN = 01…30). All seed data lives in
`src/server/db/seed-data.ts`.

## Scripts

| Script              | What it does                                                                 |
| ------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`          | `db:setup`, then `next dev`                                                  |
| `pnpm build`        | Production build (`next build`)                                              |
| `pnpm start`        | Serve the production build (`next start`)                                    |
| `pnpm test`         | Unit + API integration + component tests (Vitest, offline, ~10 s)            |
| `pnpm test:watch`   | Vitest in watch mode                                                         |
| `pnpm test:e2e`     | Builds, then runs Playwright against `next start` on port 3107 (`.data/e2e`) |
| `pnpm lint`         | ESLint (typescript-eslint type-checked rules + Next.js rules)                |
| `pnpm typecheck`    | `next typegen && tsc --noEmit`                                               |
| `pnpm format`       | Prettier write                                                               |
| `pnpm format:check` | Prettier check                                                               |
| `pnpm db:generate`  | Generate a SQL migration in `drizzle/` from `src/server/db/schema.ts`        |
| `pnpm db:migrate`   | Apply migrations to the configured database                                  |
| `pnpm db:seed`      | Insert the demo data (idempotent: existing rows are left alone)              |
| `pnpm db:setup`     | `db:migrate` + `db:seed`                                                     |
| `pnpm db:reset`     | Migrate, delete all data, re-seed                                            |

Run one test file: `pnpm test tests/api/task-list.test.ts`. One test by name:
`pnpm test -t "breaks createdAt ties"`.

## Configuration

All environment variables are optional (see `.env.example`).

| Variable         | Default                     | Meaning                                                      |
| ---------------- | --------------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`   | unset                       | Use this PostgreSQL server (node-postgres) instead of PGlite |
| `PGLITE_DIR`     | `.data/pglite`              | Directory of the embedded PGlite database                    |
| `SESSION_SECRET` | built-in development secret | HMAC key for the demo session cookie                         |

PGlite allows only **one process per data directory**: stop `pnpm dev` before running
`pnpm db:seed` / `pnpm db:reset` against `.data/pglite`. Delete `.data/` to start over.

## HTTP API

All endpoints live under `/api`, take and return JSON, and require the session cookie
except `POST /api/session` and `DELETE /api/session` (anonymous calls get **401**).

| Method & path                     | Who           | Success | Notes                                                       |
| --------------------------------- | ------------- | ------- | ----------------------------------------------------------- |
| `POST /api/session` `{userId}`    | anyone        | 200     | `{user}` + HttpOnly cookie `tf_session`; unknown user → 400 |
| `GET /api/session`                | signed in     | 200     | `{user}`                                                    |
| `DELETE /api/session`             | anyone        | 204     | clears the cookie                                           |
| `GET /api/users`                  | signed in     | 200     | `{items: User[]}` ordered by name                           |
| `GET /api/projects`               | all roles     | 200     | `{items: Project[]}` ordered by key                         |
| `POST /api/projects`              | admin         | 201     | `{key, name, description?}`; duplicate key → 409            |
| `GET /api/projects/:id`           | all roles     | 200     | unknown → 404                                               |
| `GET /api/projects/:id/tasks`     | all roles     | 200     | `?status=&priority=&q=&page=&pageSize=` → `Page<Task>`      |
| `POST /api/projects/:id/tasks`    | member, admin | 201     | unknown project → 404; invalid body → 400                   |
| `GET /api/projects/:id/dashboard` | all roles     | 200     | `{total, byStatus, byPriority, overdue}`                    |
| `GET /api/tasks/:id`              | all roles     | 200     | missing or archived → 404                                   |
| `PATCH /api/tasks/:id`            | member, admin | 200     | partial update; requires `version`; stale → 409             |
| `POST /api/tasks/:id/transition`  | member, admin | 200     | `{to, version}`; stale → 409; illegal move → 422            |
| `DELETE /api/tasks/:id`           | admin         | 204     | archives (soft-deletes) the task                            |

Semantics worth knowing:

- **List:** `page` is 1-based (default 1), `pageSize` 1–50 (default 10); out-of-range values
  → 400. Empty query values (`?status=`) mean "not set". Order is `createdAt DESC, id DESC`.
  `q` is a case-insensitive substring match on title or description (`%`, `_` and `\` are
  literal). Response: `{ items, page, pageSize, total, totalPages }` with
  `totalPages = ceil(total / pageSize)` (0 when there are no matches). A page past the end
  returns `items: []` with the real totals.
- **Visibility:** archived tasks never appear in lists, counts, search or `GET /api/tasks/:id`.
  The dashboard uses exactly the same rule, so `dashboard.total` equals the unfiltered list
  `total`, and `byStatus[s]` / `byPriority[p]` equal the list `total` filtered by `s` / `p`.
- **Overdue:** `dueDate` before today (UTC calendar date of the server clock) and status ≠ `done`.
- **Validation:** title trimmed, 3–120 chars; description ≤ 2000 (blank → `null`); `dueDate`
  `YYYY-MM-DD`, a real date, not before today when set; `estimateHours` integer 0–200;
  `priority` ∈ low/medium/high/urgent; `assigneeId` must be an existing user; unknown fields → 400.
- **PATCH:** omitted fields stay unchanged; `null` clears `description`, `assigneeId`,
  `dueDate`, `estimateHours`; at least one field besides `version` is required; `status` is
  rejected (use the transition endpoint). Every successful change increments `version` by 1.
- **Transitions:** `todo→in_progress`, `in_progress→in_review|todo`,
  `in_review→done|in_progress`, `done→in_progress`. Anything else → 422.
- **Check order:** 401 → 403 (role) → 404 → 400 (body) → 409 (version) → 422 (transition).
  A body that is not valid JSON is a 400 as soon as it is read.

Every error has the same shape, and 500s never contain internal details:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Validation failed",
    "details": {
      "fieldErrors": { "title": ["Title must be at least 3 characters"] },
      "formErrors": []
    }
  }
}
```

| Status | `code`               | `details`                                  |
| ------ | -------------------- | ------------------------------------------ |
| 400    | `validation_failed`  | `{ fieldErrors, formErrors }`              |
| 401    | `unauthorized`       | –                                          |
| 403    | `forbidden`          | –                                          |
| 404    | `not_found`          | –                                          |
| 405    | `method_not_allowed` | – (`Allow` header lists the methods)       |
| 409    | `conflict`           | `{ currentVersion }` for version conflicts |
| 422    | `invalid_transition` | `{ from, to, allowed }`                    |
| 500    | `internal_error`     | –                                          |

## Tests

```
tests/
  support/      harness.ts, fixtures.ts (STABLE), fetch-mock.ts, seed-expectations.ts, setup files
  unit/         pure domain rules: transitions, permissions, validation, dates, cookies
  api/          HTTP contract through the router with an in-memory database
  components/   React components in jsdom (TaskList, CreateTaskForm, TaskDetail)
e2e/            Playwright (pnpm test:e2e only)
```

`pnpm test` is fully offline: no Docker, no network, no Next.js server. Vitest runs two
projects chosen by file extension:

- `tests/**/*.test.ts` → **node** environment (unit + API tests, may use the harness);
- `tests/**/*.test.tsx` → **jsdom** environment with `@testing-library/jest-dom` matchers.

Both resolve the `@/` alias to `src/`. A global setup builds the migrated + seeded database
image once per run; every test context loads a private copy of it (~0.1 s).

### Stable test harness (contract)

External verification tests are dropped into `tests/` and rely **only** on the items below,
the seeded fixed ids, the HTTP contract above and the public props of the React components.
**Refactors must keep all of this backwards compatible.**

`tests/support/harness.ts`:

```ts
createTestContext(options?: { now?: Date }): Promise<TestContext>

interface TestContext {
  db: Db;                 // Drizzle handle to this context's private database
  now: Date;              // the frozen clock (default DEFAULT_TEST_NOW)
  request(
    method: string,       // 'GET' | 'POST' | 'PATCH' | 'DELETE' | ... (case-insensitive)
    path: string,         // e.g. `/api/projects/${PROJECT_IDS.web}/tasks?status=todo`
    options?: {
      as?: 'alice' | 'bob' | 'vera';   // authenticated as that demo user; omit = anonymous
      body?: unknown;                   // JSON-encoded request body
      rawBody?: string;                 // sent verbatim instead of body (e.g. malformed JSON)
      headers?: Record<string, string>;
    },
  ): Promise<{ status: number; json: any; headers: Headers }>;   // json = null for empty bodies
  handle(request: Request): Promise<Response>;  // raw access to the router (same db/clock)
  cookieFor(user: 'alice' | 'bob' | 'vera'): string;  // Cookie header value for that user
  close(): Promise<void>;
}
```

- Every `createTestContext()` call returns an **isolated** in-memory PGlite database with all
  migrations applied and the demo seed loaded. Mutating it never affects other contexts.
  Use `beforeEach` for tests that write, `beforeAll` for read-only groups; always `close()`.
- The router clock is frozen at `options.now`, default **`2026-10-20T12:00:00.000Z`**
  (`DEFAULT_TEST_NOW`; "today" = `2026-10-20`). New tasks get `createdAt = updatedAt = now`.
- Use the harness from `.test.ts` files (node environment).

`tests/support/fixtures.ts` exports `USER_IDS` (`alice`, `bob`, `vera`), `PROJECT_IDS`
(`web`, `mobile`), `seedTaskId(n)` (n = 1…30), `SEED_USERS`, `SEED_PROJECTS`, `SEED_TASKS`,
`DEFAULT_TEST_NOW` and `DEFAULT_TEST_TODAY`. Facts about the seed at the default clock:

| Project | Visible tasks | Archived (tasks) | byStatus (todo / in_progress / in_review / done) | Overdue |
| ------- | ------------- | ---------------- | ------------------------------------------------ | ------- |
| WEB     | 18            | 2 (19, 20)       | 9 / 4 / 2 / 3                                    | 3       |
| MOB     | 9             | 1 (30)           | 4 / 2 / 1 / 2                                    | 2       |

Tasks 12 and 13 share a `createdAt` (exercises the `id DESC` tie-break); "login" appears in
mixed case in WEB tasks 3, 4, 15, MOB task 24 and archived tasks 19, 30; tasks 8 and 9
contain a literal `%` and `_`; task 10 is due exactly on the default "today".

Component tests stub `fetch` (components only call relative `/api/...` URLs through
`src/lib/api-client.ts`); `tests/support/fetch-mock.ts` has `mockFetch`, `routeFetch`,
`jsonResponse`, `errorResponse`, `deferred`, `requests`, `makeTask` and `makePage`.
Public component props:

| Component (`src/components/…`)            | Props                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `TaskList` (`task-list.tsx`)              | `projectId: string; refreshKey?: number; pageSize?: number; users?: User[]` |
| `CreateTaskForm` (`create-task-form.tsx`) | `projectId: string; users?: User[]; onCreated?: (task: Task) => void`       |
| `TaskDetail` (`task-detail.tsx`)          | `taskId: string; currentUser: User` (uses `next/navigation`; mock it)       |
| `DashboardCards` (`dashboard-cards.tsx`)  | `projectId: string; refreshKey?: number`                                    |
| `ProjectView` (`project-view.tsx`)        | `projectId: string; currentUser: User`                                      |

`TaskList` renders exactly one of: loading (`role="status"`, "Loading tasks…"), error
(`role="alert"` with the API message and a **Retry** button), empty ("No tasks yet." /
"No tasks match these filters.") or a table plus pagination ("Page X of Y · N tasks",
**Previous** / **Next**). Filters are the selects labelled **Status** and **Priority**; search
is the searchbox labelled **Search** submitted with Enter or the **Search** button.
`CreateTaskForm` shows each field's first validation message inline (linked with
`aria-describedby`, field gets `aria-invalid="true"`), and a success message
(`role="status"`, `Created “<title>”.`).

### End-to-end

`pnpm test:e2e` runs `next build`, then Playwright starts `pnpm db:reset && pnpm start --port 3107`
with `PGLITE_DIR=.data/e2e` and runs `e2e/*.spec.ts` (login, create a task, filter/search) in
Chromium. It is not part of `pnpm test`.
