// pnpm db:migrate — applies pending SQL migrations to the configured database.
import { openDatabaseFromEnv } from '@/server/db/client';

const database = openDatabaseFromEnv();
try {
  await database.migrate();
  console.log(`[db:migrate] migrations applied (${database.driver})`);
} finally {
  await database.close();
}
