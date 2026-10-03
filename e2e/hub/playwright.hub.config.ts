import { defineConfig, devices } from '@playwright/test';

/**
 * Hub-hosted web e2e (Phase 31C, M647). One real compiled Hub (`dist/hub/dude-hub.cjs`) serves the Hub web build
 * (`dist/hub-web/browser`); the specs drive it in Chromium. Everything runs serially against that single Hub: the
 * specs build on each other's state (bootstrap, then devices, then security, then sign-out/recover).
 *
 * Phase 31E: no `ignoreHTTPSErrors` (Chromium refuses to register a service worker on an origin with a certificate
 * error). Chromium trusts exactly the e2e Hub's leaf key through `--ignore-certificate-errors-spki-list`, a pin, not a
 * blanket override; the global setup exports that pin before the worker (and this config) loads. Node-side helpers pin
 * the Hub's certificate with `ca`.
 */
const spki = process.env['HUB_E2E_SPKI'];
const spkiArgs = spki ? [`--ignore-certificate-errors-spki-list=${Buffer.from(spki, 'base64url').toString('base64')}`] : [];

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
    launchOptions: { args: spkiArgs },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
