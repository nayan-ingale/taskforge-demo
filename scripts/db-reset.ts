// pnpm db:reset — migrates, wipes all data and re-seeds. Used by the e2e test server.
// Stop any running dev server first: PGlite allows only one process per data directory.
import { openDatabaseFromEnv } from '@/server/db/client';
import { seedDatabase, truncateAll } from '@/server/db/seed';

const database = openDatabaseFromEnv();
try {
  await database.migrate();
  await truncateAll(database.db);
  await seedDatabase(database.db);
  console.log(`[db:reset] database reset to demo data (${database.driver})`);
} finally {
  await database.close();
}
