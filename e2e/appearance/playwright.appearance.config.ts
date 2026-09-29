import { defineConfig, devices } from '@playwright/test';
import * as path from 'node:path';

const PORT = 4310;
// Same server as the main e2e suite (serves the production build under /DUDE/); reused when running.
const E2E_DIR = path.resolve(__dirname, '..');

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  workers: process.env['APPEARANCE_WORKERS'] ?? '75%',
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '../../test-results/appearance-matrix.json' }]],
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    viewport: { width: 1366, height: 768 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } }],
  webServer: {
    command: 'node scripts/prepare-static-site.mjs && node scripts/static-server.mjs',
    cwd: E2E_DIR,
    port: PORT,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
});
