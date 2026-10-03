import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { _electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { hubClient, hubPort, pinnedTransport, readSetupToken } from '../hub/hub-helpers';

const root = path.resolve(__dirname, '../..');
export const OWNER_PASSWORD = 'correct horse battery staple 42';
const SHELL_READY_MS = 90_000;

/** Bootstraps the Hub's owner through the API (the Hub web UI is covered by `e2e/hub`). */
export async function bootstrapOwner(): Promise<void> {
  await hubClient().bootstrap({ setupToken: readSetupToken(), ownerDisplayName: 'Sync Owner', environmentName: 'Sync Environment', password: OWNER_PASSWORD });
}

/** Signs in with the owner cookie session and mints a fresh single-use pairing string (what Settings > Devices shows). */
export async function newPairingString(): Promise<string> {
  const origin = `https://localhost:${hubPort()}`;
  const transport = pinnedTransport();
  const signIn = await transport.request({ method: 'POST', path: '/api/v1/auth/sign-in', body: { password: OWNER_PASSWORD }, headers: { origin } });
  if (signIn.status !== 200) throw new Error(`Owner sign-in failed: ${signIn.status}`);
  const setCookie = signIn.headers['set-cookie'] ?? '';
  const cookie = /__Host-dude_session=([^;]*)/.exec(setCookie)?.[1];
  const csrf = (signIn.body as { csrfToken: string }).csrfToken;
  if (!cookie) throw new Error('No session cookie in the sign-in response');
  const created = await transport.request({
    method: 'POST',
    path: '/api/v1/pairing-codes',
    // The Agent connects to the literal address, as the Agent integration suite does.
    body: { host: '127.0.0.1' },
    headers: { origin, cookie: `__Host-dude_session=${cookie}`, 'x-dude-csrf': csrf },
  });
  if (created.status !== 200) throw new Error(`Creating a pairing code failed: ${created.status} ${JSON.stringify(created.body)}`);
  return (created.body as { pairingString: string }).pairingString;
}

export interface Desktop {
  name: string;
  app: ElectronApplication;
  page: Page;
  profile: string;
  /** Loads an app route in the renderer, e.g. `goto('/settings/sync')`. */
  goto(route: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Launches one real Electron desktop instance with its own `userData` (so its own Device State Store, Agent pipe and
 * single-instance lock: all three derive from userData, which is why no extra override is needed). Follows the
 * `scripts/check-desktop-workspace.mjs` pattern: a bootstrap file pins userData and stubs OS side effects
 * (protocol/login registration, window focus) before requiring the compiled main.
 */
export async function launchDesktop(name: string): Promise<Desktop> {
  const electron = (await import('electron')).default as unknown as string;
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const profile = mkdtempSync(path.join(root, 'tmp', `sync-e2e-${name}-`));
  writeFileSync(path.join(profile, 'desktop-preferences.json'), JSON.stringify({ closeToTray: false, updateMode: 'manual', startupDestination: 'deck' }));
  const bootstrap = path.join(profile, 'bootstrap.cjs');
  writeFileSync(
    bootstrap,
    `
 const {app,BrowserWindow}=require('electron');
 app.setPath('userData',${JSON.stringify(profile)});
 app.setAsDefaultProtocolClient=()=>true;
 app.setLoginItemSettings=()=>{};
 BrowserWindow.prototype.show=function(){};
 BrowserWindow.prototype.focus=function(){};
 require(${JSON.stringify(path.join(root, 'dist/electron/main.js'))});
`,
  );
  const env = { ...process.env } as Record<string, string>;
  delete env['ELECTRON_RUN_AS_NODE'];
  // Electron's BoringSSL cannot verify the Hub's self-signed pinned certificate; run each Agent on real Node (test-only override).
  env['DUDE_E2E_AGENT_NODE'] = process.execPath;
  const app = await _electron.launch({ executablePath: electron, args: [bootstrap], cwd: root, env, timeout: 60_000 });
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => console.error(`[${name}] renderer error:`, error));
  await expect(page.locator('app-sidebar')).toBeVisible({ timeout: SHELL_READY_MS });
  // First launch opens the onboarding overlay. Record completion through the Device Store (a local-only key, never
  // synced) so reloads do not bring it back, then dismiss it like the user's Skip would.
  await page.evaluate(async () => {
    const dude = (window as unknown as { dude: { store: { commitKv(ops: unknown[]): Promise<{ ok: boolean }> } } }).dude;
    await dude.store.commitKv([{ namespace: '__onboarding__', key: 'completed', value: true, policy: 'local' }]);
  });
  const skip = page.getByRole('button', { name: 'Skip for now' });
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
  await expect(skip).toBeHidden();
  const base = page.url();
  return {
    name,
    app,
    page,
    profile,
    goto: async (route) => {
      await page.goto(new URL(route, base).toString());
      await expect(page.locator('app-sidebar')).toBeVisible({ timeout: SHELL_READY_MS });
    },
    close: async () => {
      await app.close().catch(() => undefined);
    },
  };
}

/** Enrolls the instance through the UI: Settings > Environment & Hub, paste the pairing string, Connect. */
export async function enrollThroughUi(d: Desktop, pairingString: string): Promise<void> {
  await d.goto('/settings/environment');
  await d.page.getByLabel('Pairing string').fill(pairingString);
  await expect(d.page.getByTestId('connect-disclosure')).toBeVisible();
  await d.page.getByRole('button', { name: 'Connect to this Hub' }).click();
  // The connect panel is replaced by the connected view once enrolled.
  await expect(d.page.getByText('This device is connected to its Hub.')).toBeVisible({ timeout: 60_000 });
}

/** Runs the first-sync wizard picking Merge for every category. */
export async function firstSyncThroughUi(d: Desktop): Promise<void> {
  await d.goto('/settings/sync');
  await d.page.getByTestId('start-first-sync').click();
  const wizard = d.page.getByTestId('first-sync');
  await expect(wizard.getByTestId('first-sync-continue')).toBeVisible({ timeout: 60_000 });
  const merges = wizard.locator('[data-testid^="choice-"][data-testid$="-merge"]');
  for (const radio of await merges.all()) await radio.check();
  await wizard.getByTestId('first-sync-continue').click();
  await expect(d.page.getByTestId('first-sync')).toHaveCount(0, { timeout: 60_000 });
  await expect(d.page.getByTestId('phase-copy')).toHaveText(/Up to date|Syncing/, { timeout: 60_000 });
}

export function removeProfile(d: Desktop): void {
  try {
    rmSync(d.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    // A leftover temp profile is harmless (tmp/ is gitignored).
  }
}
