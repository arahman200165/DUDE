import { defineConfig, devices } from '@playwright/test';

/**
 * Hub-hosted web e2e (Phase 31C, M647). One real compiled Hub (`dist/hub/dude-hub.cjs`) serves the Hub web build
 * (`dist/hub-web/browser`); the specs drive it in Chromium. Everything runs serially against that single Hub: the
 * specs build on each other's state (bootstrap, then devices, then security, then sign-out/recover).
 *
 * The Hub's certificate is self-signed, so the browser runs with `ignoreHTTPSErrors`. Node-side helpers never do:
 * they pin the Hub's own certificate with `ca`. Phase 31E adds trusted certificates and removes the override.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report-hub' }]] : 'list',
  globalSetup: './global-setup.ts',
  use: {
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
