import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['apps/mobile/src/storage/**/*.spec.ts'], maxWorkers: 1, testTimeout: 30000 } });
