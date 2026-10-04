import { defineConfig } from 'vitest/config';

// Runs scripts/measure-hub-web.measure.ts only (npm run measure:hub-web). Not part of any test suite.
export default defineConfig({
  test: { environment: 'node', include: ['scripts/measure-hub-web.measure.ts'], globals: true, testTimeout: 900_000, hookTimeout: 120_000, fileParallelism: false },
});
