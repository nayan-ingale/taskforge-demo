import { defineConfig, devices } from '@playwright/test';

// `pnpm test:e2e` builds the app, then this config starts the production server on a
// non-default port with its own PGlite database (.data/e2e), reset to the demo seed on every run.
const PORT = 3107;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // The tests share one server and database; run them one at a time in file order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm db:reset && pnpm start --port ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      PGLITE_DIR: '.data/e2e',
      SESSION_SECRET: 'taskforge-e2e-session-secret',
    },
  },
});
