import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['packages/**/*.spec.ts'],globals:true,setupFiles:['tests/packages.setup.ts'],maxWorkers:4,testTimeout:30000}});
