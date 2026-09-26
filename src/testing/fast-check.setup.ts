// Global vitest setup (wired via angular.json's test.options.setupFiles) — fixes fast-check's
// seed and run count so every property test in the suite is deterministic across machines and CI.
import fc from 'fast-check';

fc.configureGlobal({ seed: 20260923, numRuns: 200 });
