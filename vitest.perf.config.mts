import { defineConfig } from 'vitest/config';

// Performance regression corpus (DUDE_PRD.md §21 Phase 23 Item 10) -- a separate Vitest project,
// same pattern as vitest.electron.config.mts, kept out of the main `npm test` run since wall-clock
// assertions don't belong in a suite that must stay fast and deterministic on every run.
//
// Usage: npm run test:perf
export default defineConfig({
  test: {
    environment: 'node',
    include: ['perf/**/*.perf.ts'],
    globals: true,
    setupFiles: ['tests/engine-host.setup.ts'],
    testTimeout: 20_000,
  },
});
