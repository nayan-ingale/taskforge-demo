// Inserts the deterministic demo data from seed-data.ts. Idempotent: rows that already exist
// (same primary key) are left untouched, so `pnpm db:seed` can be re-run safely.
import type { Db } from './client';
import { projects, tasks, users } from './schema';
import { SEED_PROJECTS, SEED_TASKS, SEED_USERS } from './seed-data';

export async function seedDatabase(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values([...SEED_USERS])
      .onConflictDoNothing();
    await tx
      .insert(projects)
      .values(
        SEED_PROJECTS.map((project) => ({ ...project, createdAt: new Date(project.createdAt) })),
      )
      .onConflictDoNothing();
    await tx
      .insert(tasks)
      .values(
        SEED_TASKS.map((task) => {
          const createdAt = new Date(task.createdAt);
          const archivedAt = task.archivedAt ? new Date(task.archivedAt) : null;
          return {
            ...task,
            createdAt,
            archivedAt,
            updatedAt: archivedAt ?? createdAt,
            version: archivedAt ? 2 : 1,
          };
        }),
      )
      .onConflictDoNothing();
  });
}

/** Removes all application data (keeps the schema and migration history). */
export async function truncateAll(db: Db): Promise<void> {
  await db.execute('TRUNCATE TABLE tasks, projects, users RESTART IDENTITY CASCADE');
}
