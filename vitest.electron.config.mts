import { defineConfig } from 'vitest/config';

// `apps/desktop/` is deliberately outside `tsconfig.app.json`/the main `ng test` Vitest project
// (its own tsconfig, CommonJS + Node types — see apps/desktop/AGENTS.md), so this is a small,
// separate Vitest project rather than folding it into the app's test scope. Covers
// DUDE_PRD.md §21 Phase 23 Item 9's Electron contextIsolation/preload-boundary regression check.
//
// Usage: npm run test:electron
export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/desktop/**/*.spec.ts', 'apps/device-agent/**/*.spec.ts'],
    globals: true,
    setupFiles: ['tests/engine-host.setup.ts'],
    maxWorkers: 4,
  },
});
