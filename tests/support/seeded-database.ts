// Builds the migrated + seeded database image that every test context starts from.
// Creating a PGlite database from scratch (initdb + migrations + seed) is slow and memory hungry,
// so it happens once per test run (tests/support/global-setup.ts) and contexts load the image.
import { PGlite } from '@electric-sql/pglite';
import { createPgliteDatabase } from '@/server/db/client';
import { seedDatabase } from '@/server/db/seed';

/** A tarball of a PGlite data directory with all migrations applied and the demo seed loaded. */
export async function buildSeededDatabaseImage(): Promise<Blob> {
  const client = new PGlite();
  try {
    const database = createPgliteDatabase(client);
    await database.migrate();
    await seedDatabase(database.db);
    return await client.dumpDataDir('none');
  } finally {
    await client.close();
  }
}
