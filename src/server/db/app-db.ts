// Process-wide database for the running Next.js app. Opened lazily on first use and cached on
// globalThis so dev-mode hot reloads never open a second PGlite instance on the same directory.
// Migrations and seed data are applied by `pnpm db:setup` (run automatically by `pnpm dev`).
import { type Db, type Database, openDatabaseFromEnv } from './client';

const globalForDb = globalThis as typeof globalThis & { __taskforgeDatabase?: Database };

export function getAppDb(): Db {
  globalForDb.__taskforgeDatabase ??= openDatabaseFromEnv();
  return globalForDb.__taskforgeDatabase.db;
}
