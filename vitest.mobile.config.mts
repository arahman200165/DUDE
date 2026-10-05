import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['apps/mobile/src/hub/**/*.spec.ts', 'apps/mobile/src/storage/**/*.spec.ts', 'apps/mobile/src/sync/**/*.spec.ts', 'apps/mobile/src/state/**/*.spec.ts', 'apps/mobile/src/lifecycle/**/*.spec.ts'], maxWorkers: 2, testTimeout: 30000 } });
