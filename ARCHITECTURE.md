# Architecture

A map for finding the right file quickly. TaskForge is one Next.js app with a
framework-agnostic HTTP API inside it; the browser talks to that API only.

```
Browser (client components)          src/components/*.tsx
   │  fetch('/api/...')               src/lib/api-client.ts   (the only fetch wrapper)
   ▼
Next.js catch-all route              src/app/api/[...path]/route.ts   (thin: db + delegate)
   ▼
Router  (Request, deps) -> Response  src/server/http/router.ts        (route table, auth, errors)
   ▼
Services (use cases)                 src/server/services/*-service.ts (authorize, validate, rules)
   │      uses pure domain rules     src/domain/*.ts                  (validation, transitions, permissions)
   ▼
Repositories (SQL via Drizzle)       src/server/repositories/*-repository.ts
   ▼
Database                             src/server/db/  (schema, client, seed)   drizzle/ (SQL migrations)
```

Pages (`src/app/**/page.tsx`) are thin server components: they check the session cookie
(`src/server/page-session.ts`, redirecting to `/login` when absent) and render one client
component, passing the signed-in `User` as a prop. All data loading happens in client
components through `apiClient`.

## Where is X?

| I need to…                                                            | Go to                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| See every API endpoint                                                | `src/server/http/router.ts` (`routes` table)                                |
| Change how a request is authenticated                                 | `router.ts` `currentUser()` + `src/server/http/session-cookie.ts`           |
| Change who may do what                                                | `src/domain/permissions.ts` (`can(role, action)`)                           |
| Change the task workflow / legal status moves                         | `src/domain/transitions.ts`                                                 |
| Change task input rules (title, dates, estimate, query)               | `src/domain/task-validation.ts`                                             |
| Change project input rules                                            | `src/domain/project-validation.ts`                                          |
| Change login body rules                                               | `src/domain/session-validation.ts`                                          |
| Task use cases (list, create, update, transition, archive, dashboard) | `src/server/services/task-service.ts`                                       |
| Project use cases                                                     | `src/server/services/project-service.ts`                                    |
| Users + demo login                                                    | `src/server/services/user-service.ts`                                       |
| Task SQL: filters, search, pagination, counts, versioned update       | `src/server/repositories/task-repository.ts`                                |
| Which tasks are "visible" (archived excluded)                         | `task-repository.ts` `visibleTasksWhere()`                                  |
| Error classes / helpers (`notFound`, `conflict`, …)                   | `src/server/errors.ts`                                                      |
| JSON error shape, 500 handling, `Cache-Control`                       | `src/server/http/respond.ts`                                                |
| Row → JSON (what clients see)                                         | `src/server/services/dto.ts`                                                |
| Wire types shared by server and browser                               | `src/lib/api-types.ts`                                                      |
| Browser API client + `ApiError`                                       | `src/lib/api-client.ts`                                                     |
| Tables and columns                                                    | `src/server/db/schema.ts` → `pnpm db:generate` → `drizzle/`                 |
| Database connection (PGlite vs Postgres)                              | `src/server/db/client.ts`; app singleton `src/server/db/app-db.ts`          |
| Demo data (fixed ids, dates)                                          | `src/server/db/seed-data.ts`; inserted by `src/server/db/seed.ts`           |
| Enums + display labels                                                | `src/domain/enums.ts`                                                       |
| "Today" / date parsing                                                | `src/domain/dates.ts`                                                       |
| Task list UI (filters, search, pagination, states)                    | `src/components/task-list.tsx`                                              |
| Create form UI                                                        | `src/components/create-task-form.tsx`                                       |
| Task page UI (edit, 409 handling, transitions, archive)               | `src/components/task-detail.tsx`                                            |
| Dashboard cards                                                       | `src/components/dashboard-cards.tsx`                                        |
| Project page composition                                              | `src/components/project-view.tsx`                                           |
| Login / header                                                        | `src/components/login-picker.tsx`, `user-menu.tsx`, `src/app/layout.tsx`    |
| Test harness / fixtures                                               | `tests/support/harness.ts`, `tests/support/fixtures.ts`                     |
| Test config                                                           | `vitest.config.ts`, `tests/support/global-setup.ts`, `playwright.config.ts` |

## Request lifecycle (API)

1. `src/app/api/[...path]/route.ts` exports the same handler for GET/POST/PATCH/PUT/DELETE and
   calls `handle(request, { db: getAppDb() })`.
2. `handle()` in `router.ts` matches the path against the route table. No path match → 404
   `not_found`; path matches but method does not → 405 `method_not_allowed` with `Allow`.
3. The `tf_session` cookie is verified (HMAC-SHA256, `session-cookie.ts`) and the user loaded.
   Routes declared with `route()` need a user (401 otherwise); `publicRoute()` does not.
4. The handler parses JSON (`readJson`: empty body → `undefined`, invalid JSON → 400) and
   query params (`queryToObject`: first value wins, empty values dropped), then calls a service
   with a `ServiceContext { db, now, actor }`.
5. Services run in a fixed order: `authorize()` (403) → load the resource (404; non-UUID ids are
   treated as not found, never sent to SQL) → `parseOrThrow(schema, input)` (400) →
   business rules (409 version conflict, 422 invalid transition) → repository call →
   `toXxxDto()`.
6. Anything thrown is converted by `toErrorResponse()`: an `AppError` becomes
   `{ error: { code, message, details? } }` with its status; anything else is logged via
   `deps.logError` (default `console.error`) and answered with a generic 500
   `internal_error` — never the original message, stack or SQL.

`RouterDeps` = `{ db, now?, sessionSecret?, logError? }`. Injecting `now` makes "today"
(due-date validation, overdue) and timestamps deterministic; tests always inject it.

## Data model and rules

- **users** `(id, name, email, role)` · **projects** `(id, key unique, name, description,
created_at)` · **tasks** `(id, project_id, title, description?, status, priority,
assignee_id?, due_date? date, estimate_hours? int, version, archived_at?, created_at,
updated_at)`; enums are Postgres enums generated from `src/domain/enums.ts`.
- **Archiving** sets `archived_at` (soft delete) and bumps `version`. Archived tasks are
  invisible everywhere; `visibleTasksWhere()` is the single definition used by the list, the
  list count and the dashboard, which is what keeps their numbers equal.
- **Optimistic concurrency:** clients send the `version` they last saw. The service compares
  it first (fast 409), then `updateTaskIfVersion()` performs
  `UPDATE … SET version = version + 1 … WHERE id = ? AND version = ? AND archived_at IS NULL`,
  so concurrent writers cannot both win; a lost race re-reads and answers 409 (or 404 if the
  task was archived meanwhile). 409 details carry `currentVersion`.
- **Ordering:** task lists are `ORDER BY created_at DESC, id DESC` (index
  `tasks_project_created_idx`); `total` comes from a `count(*)` with the same `WHERE`.
- **Search:** `ILIKE '%q%' ESCAPE '\'` on title OR description, with `%`, `_`, `\` escaped by
  `escapeLikePattern()`.
- **Dates:** due dates are plain `YYYY-MM-DD` strings; "today" is `toDateString(now)` (UTC).
  Timestamps are ISO 8601 strings on the wire.
- **Ids:** UUIDs. Seed ids are fixed and readable (`1…` users, `2…` projects, `3…` tasks).

## Frontend

- Client components fetch through `apiClient` only; non-2xx responses become `ApiError`
  (`status`, `code`, `message`, `fieldErrors`). Network failures are `ApiError` with
  `status 0`, `code 'network_error'`.
- Lists use a "request key" pattern: the component derives a key from everything that affects
  the request (filters, page, refreshKey, retry attempt) and is _loading_ until a result (data or
  error) for exactly that key arrives. Stale responses are ignored, and an error always ends
  the loading state.
- Forms validate with the same zod schemas as the API (`src/domain/*-validation.ts`), then map
  server `fieldErrors` onto fields with `firstFieldErrors()` (`src/lib/form-errors.ts`).
- Role-dependent controls use `can()` from `src/domain/permissions.ts`; the API enforces the
  same rules independently.
- Login/logout use a full page load so the server-rendered header re-reads the cookie.

## Tests

- `tests/unit` – pure functions in `src/domain` and small server helpers.
- `tests/api` – the HTTP contract, driven through `createTestContext()` (no Next.js, no
  network, in-memory PGlite per context). Expected values are computed from the seed fixtures
  (`tests/support/seed-expectations.ts`), independently of the app's SQL.
- `tests/components` – jsdom + Testing Library with `fetch` stubbed (`tests/support/fetch-mock.ts`).
- `e2e/` – Playwright against a production build on port 3107 with its own PGlite directory.
- `vitest.config.ts` defines two projects by extension (`.test.ts` → node, `.test.tsx` → jsdom)
  and caps workers at 50 % of CPUs: each worker holds PGlite instances (~200 MB each).
- `tests/support/global-setup.ts` builds the migrated + seeded database image once per run
  (`seeded-database.ts`); the harness loads a copy per context and falls back to building it
  in-process if the global setup did not run.

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`; `@/` = `src/`. Type-only imports use
  `import { type X }` (lint-enforced).
- Domain modules (`src/domain`) are pure: no I/O, no Next.js, safe to import from the browser.
- `src/server/**` is server-only (database, crypto, Next `cookies()`); never import it from a
  `'use client'` file. (`seed-data.ts` is plain data and is used by the server-rendered login page.)
- Services throw `AppError`s via the helpers in `src/server/errors.ts`; they never build
  `Response`s. Routes never contain business rules.
- Every API error goes through `toErrorResponse()`; never return ad-hoc error JSON.
- Schema change: edit `schema.ts` → `pnpm db:generate` → review the new SQL in `drizzle/` →
  update `dto.ts`, `api-types.ts`, validation, seed data and tests as needed.
- New endpoint: add a `route()` line in `router.ts`, a service function (authorize → load →
  validate → rules → repository), repository queries if needed, an `apiClient` method, and
  API tests using the harness.
- Keep `tests/support/harness.ts`, `tests/support/fixtures.ts`, the seeded ids and the HTTP
  contract backwards compatible: external tests depend on them (README, "Stable test harness").
