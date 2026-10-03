import { defineConfig } from 'vitest/config';

// Runs scripts/measure-sync.measure.ts only (npm run measure:sync). Not part of any test suite.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/measure-sync.measure.ts'],
    globals: true,
    testTimeout: 600_000,
    hookTimeout: 120_000,
    setupFiles: ['tests/engine-host.setup.ts'],
  },
});
