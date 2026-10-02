import { defineConfig } from 'vitest/config';

// The Hub (`apps/hub/`) is plain Node TypeScript with its own tsconfig, outside the Angular test project.
//
// Usage: npm run test:hub
export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/hub/**/*.spec.ts'],
    globals: true,
    testTimeout: 30000,
    maxWorkers: 4,
  },
});
