import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` diffs src/server/db/schema.ts against /drizzle and writes a new SQL migration.
// It never connects to a database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
});
