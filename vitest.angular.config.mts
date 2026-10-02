import { defineConfig } from 'vitest/config';

// Bound CPU contention without increasing confirmation-boundary test timeouts.
export default defineConfig({ test: { maxWorkers: 4 } });
