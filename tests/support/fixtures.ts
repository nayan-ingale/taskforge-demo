// STABLE TEST CONTRACT — fixed seed data for tests. See README.md "Test harness".
// Re-exports the deterministic seed (src/server/db/seed-data.ts) plus the default test clock.
// Refactors must keep these names and values.
export {
  PROJECT_IDS,
  SEED_PROJECTS,
  SEED_TASKS,
  SEED_USERS,
  USER_IDS,
  seedTaskId,
  type DemoUserKey,
  type SeedTask,
} from '@/server/db/seed-data';

/**
 * Default clock of createTestContext(): 2026-10-20T12:00:00Z, so "today" is 2026-10-20.
 * Seeded due dates are chosen around this date (some overdue, one due today).
 */
export const DEFAULT_TEST_NOW = new Date('2026-10-20T12:00:00.000Z');

/** The calendar date of DEFAULT_TEST_NOW. */
export const DEFAULT_TEST_TODAY = '2026-10-20';
