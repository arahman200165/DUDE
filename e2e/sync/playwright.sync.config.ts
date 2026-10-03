import { defineConfig } from '@playwright/test';

/**
 * Two-desktop sync e2e (Phase 31D, M661). One real compiled Hub (`dist/hub/dude-hub.cjs`), two real Electron
 * instances (`dist/electron/main.js`, each with its own userData and therefore its own Device State Store and
 * resident Agent) driven through the real UI. Serial: the specs build on each other's state.
 *
 * Needs the desktop renderer build (`ng build --configuration production,electron`) and `npm run electron:compile`;
 * `npm run test:e2e:sync` does both. Windows only (the Agent pipe and the check-desktop harness are Windows-first).
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report-sync' }]] : 'list',
  globalSetup: './global-setup.ts',
});
