import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// `pnpm test` runs two projects:
//   node — tests/**/*.test.ts  (unit + API integration tests; in-memory PGlite, no network)
//   dom  — tests/**/*.test.tsx (React component tests in jsdom)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    testTimeout: 15_000,
    hookTimeout: 30_000,
    restoreMocks: true,
    // Each worker holds in-memory PGlite databases (~200 MB each); more workers than this mostly
    // adds memory pressure without making the run faster.
    maxWorkers: '50%',
    unstubGlobals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          globalSetup: ['./tests/support/global-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
          setupFiles: ['./tests/support/setup-dom.ts'],
        },
      },
    ],
  },
});
