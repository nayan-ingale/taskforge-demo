// Expected values computed straight from the seed fixtures (independently of the app's SQL),
// so API tests can compare the server's answers against a simple in-memory model.
import { SEED_TASKS, type SeedTask } from './fixtures';

/** Visible (non-archived) seeded tasks of a project in API order: createdAt DESC, id DESC. */
export function visibleSeedTasks(projectId: string): SeedTask[] {
  return SEED_TASKS.filter((task) => task.projectId === projectId && task.archivedAt === null).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
}

export function ids(items: ReadonlyArray<{ id: string }>): string[] {
  return items.map((item) => item.id);
}
