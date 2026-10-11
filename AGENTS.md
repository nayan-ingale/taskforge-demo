# Notes for coding agents

- Read `ARCHITECTURE.md` first: it maps every concern to a file. `README.md` documents the
  HTTP contract and the stable test harness.
- Node 24 + pnpm 10. Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (offline, ~10 s),
  `pnpm format:check`; `pnpm test:e2e` builds and runs Playwright on port 3107.
- Keep `tests/support/harness.ts`, `tests/support/fixtures.ts`, the seeded ids and the HTTP
  contract backwards compatible; external tests depend on them.
- Business rules live in `src/domain` (pure) and `src/server/services`; SQL only in
  `src/server/repositories`. Every error goes through `src/server/errors.ts` +
  `src/server/http/respond.ts`.
- PGlite allows one process per data directory: stop `pnpm dev` before `pnpm db:reset`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
