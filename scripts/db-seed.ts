// pnpm db:seed — inserts the deterministic demo data (idempotent).
import { openDatabaseFromEnv } from '@/server/db/client';
import { seedDatabase } from '@/server/db/seed';

const database = openDatabaseFromEnv();
try {
  await seedDatabase(database.db);
  console.log(`[db:seed] demo data present (${database.driver})`);
} finally {
  await database.close();
}
