import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['apps/mobile/src/hub/**/*.spec.ts'], maxWorkers: 2, testTimeout: 10000 } });
