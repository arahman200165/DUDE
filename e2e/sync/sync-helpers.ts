import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { _electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import type { AgentSyncStatus, DesktopHubStatus, DeviceStoreBoot, EntityCommitResult, FirstSyncChoice, FirstSyncPreview } from '@dude/contracts';
import type { SyncRecord } from '@dude/contracts/hub';
import { SimulatedDevice, hubClient, pinnedTransport, sharedHub, type HubTarget } from '../hub/hub-helpers';

const root = path.resolve(__dirname, '../..');
export const OWNER_PASSWORD = 'correct horse battery staple 42';
const SHELL_READY_MS = 90_000;

/** Bootstraps the Hub's owner through the API (the Hub web UI is covered by `e2e/hub`). Defaults to the shared Hub of the global setup. */
export async function bootstrapOwner(target: HubTarget = sharedHub()): Promise<void> {
  const setupToken = readFileSync(path.join(target.dataDir, 'config', 'setup-token'), 'utf8').trim();
  await hubClient(target).bootstrap({ setupToken, ownerDisplayName: 'Sync Owner', environmentName: 'Sync Environment', password: OWNER_PASSWORD });
}

/**
 * Signs in with the owner cookie session (a fresh sign-in is password-confirmed for the step-up window) and mints a fresh single-use
 * pairing string (what Settings > Devices shows). `reattachDeviceId` binds the code to a restored device row that needs re-pairing
 * (PD-072). The Agent connects to the literal address, as the Agent integration suite does.
 */
export async function newPairingString(target: HubTarget = sharedHub(), options: { reattachDeviceId?: string } = {}): Promise<string> {
  const origin = `https://localhost:${target.port}`;
  const transport = pinnedTransport(target);
  let signIn = await transport.request({ method: 'POST', path: '/api/v1/auth/sign-in', body: { password: OWNER_PASSWORD }, headers: { origin } });
  // The credential-endpoint bucket (burst 10) can answer 429 when a spec signs in repeatedly; honour its retry hint.
  for (let attempt = 0; signIn.status === 429 && attempt < 5; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, Number(signIn.headers['retry-after'] ?? 3)) * 1000));
    signIn = await transport.request({ method: 'POST', path: '/api/v1/auth/sign-in', body: { password: OWNER_PASSWORD }, headers: { origin } });
  }
  if (signIn.status !== 200) throw new Error(`Owner sign-in failed: ${signIn.status}`);
  const setCookie = signIn.headers['set-cookie'] ?? '';
  const cookie = /__Host-dude_session=([^;]*)/.exec(setCookie)?.[1];
  const csrf = (signIn.body as { csrfToken: string }).csrfToken;
  if (!cookie) throw new Error('No session cookie in the sign-in response');
  const created = await transport.request({
    method: 'POST',
    path: '/api/v1/pairing-codes',
    body: { host: '127.0.0.1', ...(options.reattachDeviceId === undefined ? {} : { reattachDeviceId: options.reattachDeviceId }) },
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

// --- Extra Hubs of the RELEASE bundle and the real `dude-hub` CLI (Phase 31G restore/transfer drill) --------------------------------

const HUB_BUNDLE = path.join(root, 'dist', 'hub', 'dude-hub.cjs');

export interface RunningHub {
  readonly target: HubTarget;
  readonly dataDir: string;
  /** Stops the process and waits for it to exit (idempotent). */
  stop(): Promise<void>;
  /** Everything the Hub wrote to stderr (for failure messages). */
  stderr(): string;
}

/**
 * Starts one more Hub from the compiled RELEASE bundle (`dist/hub`, no web root) on `dataDir` (fresh or restored) and `options.port`
 * (default: OS-chosen). It never touches the shared Hub of the global setup. `extraCert` is extra trust (PEM) added to what Node
 * clients pin, for a Hub that reuses another Hub's certificate chain without owning the CA root file.
 */
export async function spawnReleaseHub(dataDir: string, options: { port?: number } = {}): Promise<RunningHub> {
  if (!existsSync(HUB_BUNDLE)) throw new Error(`The release bundle is missing: ${HUB_BUNDLE}; run: npm run hub:compile`);
  const child: ChildProcess = spawn(process.execPath, [HUB_BUNDLE, 'run', '--data-dir', dataDir, '--port', String(options.port ?? 0)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  let exited = false;
  const exit = new Promise<void>((resolve) => child.once('exit', () => { exited = true; resolve(); }));
  const stop = async (): Promise<void> => {
    if (exited) return;
    const force = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.kill('SIGTERM');
    await exit;
    clearTimeout(force);
  };
  try {
    const listening = await new Promise<{ url: string; spkiSha256: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`The Hub did not start within 60 s. ${stderr}`)), 60_000);
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`The Hub exited early with ${code}. ${stderr}`)); });
      createInterface({ input: child.stdout! }).on('line', (line) => {
        try {
          const parsed = JSON.parse(line) as { event?: string; url?: string; spkiSha256?: string };
          if (parsed.event === 'listening' && parsed.url && parsed.spkiSha256) {
            clearTimeout(timer);
            resolve({ url: parsed.url, spkiSha256: parsed.spkiSha256 });
          }
        } catch {
          // Not a JSON line (log output).
        }
      });
    });
    const port = Number(new URL(listening.url).port);
    const rootFile = path.join(dataDir, 'config', 'tls', 'ca', 'ca-cert.pem');
    const cert = readFileSync(path.join(dataDir, 'config', 'tls', 'cert.pem'), 'utf8') + (existsSync(rootFile) ? readFileSync(rootFile, 'utf8') : '');
    return { target: { url: `https://localhost:${port}`, port, cert, spki: listening.spkiSha256, dataDir }, dataDir, stop, stderr: () => stderr };
  } catch (error) {
    await stop();
    throw error;
  }
}

export interface CliResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs one real `dude-hub` CLI command of the release bundle to completion. The backup passphrase goes in `env`, never a flag. */
export function runHubCli(args: readonly string[], options: { env?: Record<string, string>; timeoutMs?: number } = {}): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(process.execPath, [HUB_BUNDLE, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...options.env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`dude-hub ${args.join(' ')} did not finish within ${options.timeoutMs ?? 120_000} ms. ${stderr}`));
    }, options.timeoutMs ?? 120_000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

export const BACKUP_PASSPHRASE = 'sync e2e restore drill passphrase 2026';
export const OLD_HUB_GONE_PHRASE = 'THE OLD HUB IS GONE';
const passphraseEnv = { DUDE_HUB_BACKUP_PASSPHRASE: BACKUP_PASSPHRASE };

/** The first step of a two-step CLI command (nothing is written): the printed single-use token. */
async function previewToken(args: readonly string[]): Promise<string> {
  const result = await runHubCli(args, { env: passphraseEnv });
  if (result.code !== 0) throw new Error(`dude-hub ${args.join(' ')} failed (${result.code}): ${result.stderr}`);
  const token = (JSON.parse(result.stdout.trim()) as { confirmToken?: string }).confirmToken;
  if (typeof token !== 'string') throw new Error(`dude-hub ${args.join(' ')} printed no confirmToken: ${result.stdout}`);
  return token;
}

/** `backup create [--for-transfer]` against a RUNNING Hub, both steps; resolves with the verified `.dudebackup` file. */
export async function createBackup(hub: RunningHub, folder: string, options: { forTransfer?: boolean } = {}): Promise<string> {
  mkdirSync(folder, { recursive: true });
  const base = ['backup', 'create', ...(options.forTransfer ? ['--for-transfer'] : []), '--folder', folder, '--data-dir', hub.dataDir];
  const token = await previewToken(base);
  const applied = await runHubCli([...base, '--confirm', token], { env: passphraseEnv, timeoutMs: 180_000 });
  if (applied.code !== 0) throw new Error(`backup create failed (${applied.code}): ${applied.stderr}`);
  const files = readdirSync(folder).filter((name) => /^dude-hub-.*\.dudebackup$/.test(name));
  if (files.length !== 1) throw new Error(`Expected exactly one backup in ${folder}, found: ${files.join(', ') || 'none'}`);
  return path.join(folder, files[0]!);
}

/** `backup restore` (offline) into a fresh `dataDir`, both steps; a backup that was not made for transfer needs `oldHubGone`. */
export async function restoreBackup(file: string, dataDir: string, options: { oldHubGone?: boolean } = {}): Promise<{ authorityEpoch: number; devices: number }> {
  mkdirSync(dataDir, { recursive: true });
  const base = ['backup', 'restore', '--file', file, '--data-dir', dataDir];
  const token = await previewToken(base);
  const applied = await runHubCli([...base, '--confirm', token, ...(options.oldHubGone ? ['--old-hub-gone', OLD_HUB_GONE_PHRASE] : [])], { env: passphraseEnv, timeoutMs: 180_000 });
  if (applied.code !== 0) throw new Error(`backup restore failed (${applied.code}): ${applied.stderr}`);
  return JSON.parse(applied.stdout.trim()) as { authorityEpoch: number; devices: number };
}

/** A simulated device enrolled with the Hub (a normal pairing code): an independent reader of what the Hub holds. */
export async function enrollObserver(target: HubTarget, name = 'E2E Observer'): Promise<SimulatedDevice> {
  const observer = new SimulatedDevice(target);
  await observer.enroll(await newPairingString(target), name);
  return observer;
}

/** The favorites a Hub currently holds (newest revision per entity, tombstones excluded), as entity ids; also fails on any favorite tombstone. */
export async function hubFavorites(observer: SimulatedDevice): Promise<string[]> {
  const newest = new Map<string, SyncRecord>();
  for (const record of await observer.changes(0)) {
    if (record.entityType !== 'favorite') continue;
    const seen = newest.get(record.entityId);
    if (seen === undefined || record.revision > seen.revision) newest.set(record.entityId, record);
  }
  const tombstones = [...newest.values()].filter((r) => r.deleted).map((r) => r.entityId);
  expect(tombstones, 'the Hub must hold no favorite tombstones: nothing may be deleted').toEqual([]);
  return [...newest.keys()].sort();
}

// --- Driving a real desktop's Agent through the preload bridge (`window.dude`), the same calls the Settings UI makes ---------------------

/** Calls `window.dude.<path>(...args)` in the renderer and returns whatever the bridge resolves with. */
export async function bridgeCall<T>(d: Desktop, bridgePath: string, ...args: unknown[]): Promise<T> {
  return (await d.page.evaluate(
    async ({ bridgePath: p, args: a }) => {
      const parts = p.split('.');
      let owner: unknown = (window as unknown as { dude: unknown }).dude;
      let fn: unknown = owner;
      for (const part of parts) {
        owner = fn;
        fn = (fn as Record<string, unknown>)[part];
      }
      return await (fn as (...rest: unknown[]) => Promise<unknown>).apply(owner, a);
    },
    { bridgePath, args },
  )) as T;
}

export class BridgeError extends Error {
  constructor(readonly bridgePath: string, readonly code: string, message: string) {
    super(`${bridgePath} failed with ${code}: ${message}`);
  }
}

/** A `window.dude.hub` / `window.dude.sync` call: unwraps the `{ ok, result | error }` envelope, throwing a `BridgeError` on failure. */
export async function bridgeResult<T>(d: Desktop, bridgePath: string, ...args: unknown[]): Promise<T> {
  const envelope = await bridgeCall<{ ok: true; result: T } | { ok: false; error: { code: string; message: string } }>(d, bridgePath, ...args);
  if (!envelope.ok) throw new BridgeError(bridgePath, envelope.error.code, envelope.error.message);
  return envelope.result;
}

export const hubStatus = (d: Desktop): Promise<DesktopHubStatus> => bridgeResult<DesktopHubStatus>(d, 'hub.status');
export const syncStatus = (d: Desktop): Promise<AgentSyncStatus> => bridgeResult<AgentSyncStatus>(d, 'sync.status');

/** The device id this desktop's Agent registered with its Hub (the id a re-attach code is bound to). */
export async function deviceIdOf(d: Desktop): Promise<string> {
  const boot = await bridgeCall<DeviceStoreBoot>(d, 'store.hydrate');
  if (!boot.device) throw new Error(`${d.name} has no device record`);
  return boot.device.deviceId;
}

/** A tool favorite, committed through the Device State Store exactly like the app's own favorite toggle (journaled for sync). */
export async function commitFavorite(d: Desktop, toolId: string, order: number): Promise<void> {
  const result = await bridgeCall<EntityCommitResult>(d, 'store.commitEntity', {
    entityType: 'favorite', entityId: `tool:${toolId}`, op: 'upsert',
    payload: { id: `tool:${toolId}`, kind: 'tool', targetId: toolId, order, pinnedAt: new Date().toISOString() },
  });
  if (!result.ok) throw new Error(`Committing favorite ${toolId} on ${d.name} failed: ${result.error}`);
}

/** The favorites held locally in this desktop's Device State Store (entity ids, sorted). */
export async function localFavorites(d: Desktop): Promise<string[]> {
  const boot = await bridgeCall<DeviceStoreBoot>(d, 'store.hydrate');
  return boot.records.filter((r) => r.entityType === 'favorite').map((r) => r.entityId).sort();
}

export const favoriteIds = (...toolIds: string[]): string[] => toolIds.map((id) => `tool:${id}`).sort();

/** Polls until the Agent reports it is in step with its Hub: nothing pending, held or quarantined and no conflict. */
export async function waitUntilSynced(d: Desktop, timeout = 90_000): Promise<void> {
  await expect
    .poll(async () => {
      const s = await syncStatus(d);
      return `${s.phase} pending=${s.pending} held=${s.held} quarantined=${s.quarantined} conflicts=${s.conflicts}`;
    }, { message: `${d.name} never reached idle with an empty outbox`, timeout })
    .toBe('idle pending=0 held=0 quarantined=0 conflicts=0');
}

/** The first-sync preview and apply over the bridge, choosing Merge for every category (the wizard's "Merge everything"). */
export async function firstSyncMergeAll(d: Desktop): Promise<AgentSyncStatus> {
  const preview = await bridgeResult<FirstSyncPreview>(d, 'sync.firstSyncPreview');
  const choices = Object.fromEntries(preview.categories.map((c) => [c.category, 'merge' as FirstSyncChoice]));
  return bridgeResult<AgentSyncStatus>(d, 'sync.firstSyncApply', choices, preview.digest);
}

/** Recovery snapshots the Agent took (`<profile>/device-store/backups/<prefix>-*.db`), by file name. */
export function recoverySnapshots(d: Desktop, prefix: string): string[] {
  const dir = path.join(d.profile, 'device-store', 'backups');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.db')).sort();
}
