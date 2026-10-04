import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  PASSWORD, SimulatedDevice, favoritePayload, hubClient, openHubBrowser, pairSimulatedDevice, pinnedTransport, runHubCli, signInAsOwner, spawnExtraHub, upsertOp,
  type ExtraHub, type HubTarget,
} from './hub-helpers';

// Phase 31G exit drill: move a Hub to "another machine" with REAL processes. Two (three) extra Hubs of the compiled TEST bundle, each
// on its own data directory and OS-chosen port, the real `dude-hub` CLI (backup create --for-transfer, backup restore, backup
// reactivate) and real Chromium pages. The shared Hub of the other specs is never touched.
//
//   T1  the original Hub: owner, a paired (simulated) desktop with synced records
//       -> backup create --for-transfer (T1 is retired: hello still answers, everything else is 503 hub-transferred)
//   T2  the restored Hub: a new instance id and epoch + 1, the old owner password still works, the desktop needs re-pair
//       -> a re-pair code from Settings > Devices lets the same device id enroll with a NEW key and push again
//   T1  started again on its own data directory and reactivated: the documented rollback if the restore never happened.
test.describe.configure({ mode: 'serial' });

const BACKUP_PASSPHRASE = 'e2e transfer drill passphrase 2026';
const WRONG_PASSPHRASE = 'definitely not the right passphrase';
const REPLACE_PHRASE = 'REPLACE HUB DATA';
const OLD_HUB_GONE_PHRASE = 'THE OLD HUB IS GONE';
const DEVICE_NAME = 'Transfer Desktop';

let root = '';
const dirs = { t1: '', t2: '', t3: '', backups: '', plainBackups: '' };
const hubs: ExtraHub[] = [];
const browsers: Browser[] = [];

let t1: ExtraHub;
let t2: ExtraHub;
let device: SimulatedDevice;
let transferFile = '';
let t1InstanceId = '';
let t1Epoch = 0;
let t1FavoriteKeys: string[] = [];
let t1Counts: Record<string, number> = {};
let t2InstanceId = '';

async function startHub(dataDir: string): Promise<ExtraHub> {
  const hub = await spawnExtraHub(dataDir);
  hubs.push(hub);
  return hub;
}

async function openBrowser(target: HubTarget): Promise<{ page: Page; close: () => Promise<void> }> {
  const opened = await openHubBrowser(target);
  browsers.push(opened.browser);
  return { page: opened.page, close: () => opened.browser.close() };
}

const passEnv = (passphrase = BACKUP_PASSPHRASE): Record<string, string> => ({ DUDE_HUB_BACKUP_PASSPHRASE: passphrase });
const jsonOf = (stdout: string): Record<string, any> => JSON.parse(stdout.trim()) as Record<string, any>;

/** The first step of a two-step CLI command: run it, expect a printed token. */
async function preview(args: string[], env?: Record<string, string>): Promise<string> {
  const result = await runHubCli(args, env === undefined ? {} : { env });
  expect(result.code, `${args.join(' ')}\n${result.stderr}`).toBe(0);
  const printed = jsonOf(result.stdout);
  expect(typeof printed['confirmToken']).toBe('string');
  return printed['confirmToken'] as string;
}

/** Content hash of every file under a directory (a path is part of the hash), to prove a refused command changed nothing. */
function fingerprint(dir: string): string {
  const hash = createHash('sha256');
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else hash.update(path.relative(dir, full)).update(readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest('hex');
}

const backupFilesIn = (dir: string): string[] => readdirSync(dir).filter((name) => /^dude-hub-.*\.dudebackup$/.test(name));

test.beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'dude-hub-e2e-transfer-'));
  for (const [key, name] of Object.entries({ t1: 'hub-t1', t2: 'hub-t2', t3: 'hub-t3', backups: 'backups', plainBackups: 'backups-plain' })) {
    const dir = path.join(root, name);
    mkdirSync(dir, { recursive: true });
    dirs[key as keyof typeof dirs] = dir;
  }
});

test.afterAll(async () => {
  for (const browser of browsers) await browser.close().catch(() => undefined);
  for (const hub of hubs) await hub.stop().catch(() => undefined);
  try {
    if (root !== '') rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // A leftover temp directory is harmless.
  }
});

test('1. Hub T1: owner, a paired desktop and synced records', async () => {
  test.setTimeout(180_000);
  t1 = await startHub(dirs.t1);
  const client = hubClient(t1.target);
  const hello = await client.hello();
  expect(hello.bootstrapped).toBe(false);
  t1InstanceId = hello.hubInstanceId;
  t1Epoch = hello.authorityEpoch ?? 1;

  const setupToken = readFileSync(path.join(dirs.t1, 'config', 'setup-token'), 'utf8').trim();
  await client.bootstrap({ setupToken, ownerDisplayName: 'Transfer Owner', environmentName: 'Transfer Environment', password: PASSWORD });

  const { page, close } = await openBrowser(t1.target);
  await signInAsOwner(page, PASSWORD);
  device = await pairSimulatedDevice(page, DEVICE_NAME, t1.target);
  expect(await device.token()).toMatch(/^ddt_/);
  // Leave nothing behind that could still write to the Hub (a page's own sync) before the counts are read and the backup is made.
  await close();

  const results = await device.push([
    upsertOp('favorite', 'tool:json', favoritePayload('json', 1), null),
    upsertOp('favorite', 'tool:base64', favoritePayload('base64', 2), null),
    upsertOp('favorite', 'tool:uuid', favoritePayload('uuid', 3), null),
  ]);
  expect(results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);

  t1FavoriteKeys = (await device.changes(0)).filter((r) => !r.deleted && r.entityType === 'favorite').map((r) => `${r.entityType}:${r.entityId}`).sort();
  expect(t1FavoriteKeys).toHaveLength(3);
  const ownerBearer = await device.ownerBearer(PASSWORD);
  t1Counts = { ...(await hubClient(t1.target).syncSummary(ownerBearer)).counts } as Record<string, number>;
  expect(t1Counts['favorites']).toBe(3);
});

test('2. backup create --for-transfer retires T1: hello answers, everything else is 503 hub-transferred, the web shows the moved notice', async () => {
  test.setTimeout(240_000);
  const base = ['backup', 'create', '--for-transfer', '--folder', dirs.backups, '--data-dir', dirs.t1];
  const token = await preview(base);
  expect(backupFilesIn(dirs.backups)).toEqual([]); // the preview writes nothing

  const applied = await runHubCli([...base, '--confirm', token], { env: passEnv(), timeoutMs: 180_000 });
  expect(applied.code, applied.stderr).toBe(0);
  expect(jsonOf(applied.stdout)['retired']).toBe(true);
  const files = backupFilesIn(dirs.backups);
  expect(files).toHaveLength(1);
  transferFile = path.join(dirs.backups, files[0]!);
  expect(existsSync(transferFile)).toBe(true);
  expect(statSync(transferFile).size).toBeGreaterThan(1024);
  expect(existsSync(`${transferFile}.part`)).toBe(false);

  const transport = pinnedTransport(t1.target);
  const hello = await transport.request({ method: 'GET', path: '/api/v1/hello' });
  expect(hello.status).toBe(200);
  expect(hello.body).toMatchObject({ hubInstanceId: t1InstanceId, authorityState: 'transferred', authorityEpoch: t1Epoch });

  const signIn = await transport.request({ method: 'POST', path: '/api/v1/auth/sign-in', body: { password: PASSWORD } });
  expect(signIn.status).toBe(503);
  expect(signIn.body).toMatchObject({ error: { code: 'hub-transferred' } });
  await expect(device.push([upsertOp('favorite', 'tool:hash', favoritePayload('hash', 4), null)])).rejects.toMatchObject({ status: 503, code: 'hub-transferred' });
  await expect(device.moveTo(t1.target).token()).rejects.toMatchObject({ status: 503, code: 'hub-transferred' });

  const { page, close } = await openBrowser(t1.target);
  await page.goto('/');
  await expect(page.getByTestId('hub-authority-notice')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'This Hub was moved' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('submit')).toHaveCount(0);
  await close();
});

test('3. restore on a fresh data directory: new identity, epoch + 1, the old password works and the desktop needs re-pair', async () => {
  test.setTimeout(300_000);
  await t1.stop();

  const base = ['backup', 'restore', '--file', transferFile, '--data-dir', dirs.t2];
  const token = await preview(base, passEnv());
  expect(existsSync(path.join(dirs.t2, 'data', 'dude.db'))).toBe(false); // the preview changes nothing
  const applied = await runHubCli([...base, '--confirm', token], { env: passEnv(), timeoutMs: 180_000 });
  expect(applied.code, applied.stderr).toBe(0);
  expect(jsonOf(applied.stdout)).toMatchObject({ authorityEpoch: t1Epoch + 1, devices: 1 });

  t2 = await startHub(dirs.t2);
  const hello = await hubClient(t2.target).hello();
  t2InstanceId = hello.hubInstanceId;
  expect(t2InstanceId).not.toBe(t1InstanceId);
  expect(hello.authorityEpoch).toBe(t1Epoch + 1);
  expect(hello.authorityState).toBe('active');
  expect(hello.bootstrapped).toBe(true);

  // The old device key is refused: the restore revoked it, so the challenge/token exchange does not succeed.
  const staleKey = device.moveTo(t2.target);
  const refused = await staleKey.token().then(() => null, (error: { name?: string; status?: number }) => error);
  expect(refused?.name).toBe('HubApiError');
  expect(refused?.status).toBeGreaterThanOrEqual(400);
  expect(refused?.status).toBeLessThan(500);

  const { page, close } = await openBrowser(t2.target);
  await signInAsOwner(page, PASSWORD);
  await page.goto('/settings/devices');
  const row = page.getByTestId(`device-row-${device.deviceId}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId('device-name')).toHaveText(DEVICE_NAME);
  await expect(row.getByTestId('needs-re-pair')).toBeVisible();
  await expect(row.getByText('Needs re-pair')).toBeVisible();

  // The synced records came across: the owner's cookie session reads the same per-category counts the old Hub had.
  const summary = await page.evaluate(async () => (await fetch('/api/v1/sync/summary')).json() as Promise<{ counts: Record<string, number> }>);
  expect(summary.counts['favorites']).toBe(t1Counts['favorites']);
  for (const [category, count] of Object.entries(t1Counts)) expect(summary.counts[category] ?? 0, category).toBeGreaterThanOrEqual(count);
  await close();
});

test('4. re-pair from Settings > Devices: the same device id enrolls with a new key and syncs again; Backup & Transfer reports the new epoch', async () => {
  test.setTimeout(240_000);
  const { page, close } = await openBrowser(t2.target);
  await signInAsOwner(page, PASSWORD);
  await page.goto('/settings/devices');

  const row = page.getByTestId(`device-row-${device.deviceId}`);
  await expect(row.getByTestId('needs-re-pair')).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button', { name: `Create re-pair code for ${DEVICE_NAME}` }).click();
  const pairing = page.getByTestId('pairing-string');
  const stepUp = page.getByTestId('step-up-password');
  // A fresh sign-in is password-confirmed for five minutes; when that has lapsed the UI asks again (step-up).
  await expect(pairing.or(stepUp)).toBeVisible({ timeout: 30_000 });
  if (await stepUp.isVisible()) {
    await stepUp.fill(PASSWORD);
    await page.getByTestId('step-up-confirm').click();
  }
  await expect(pairing).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('pairing-reattach')).toBeVisible();
  const pairingString = (await pairing.innerText()).trim();

  const staleKey = device.moveTo(t2.target);
  const repaired = device.moveTo(t2.target, { newKey: true });
  expect(repaired.deviceId).toBe(device.deviceId);
  await repaired.enroll(pairingString, DEVICE_NAME);
  expect(await repaired.token()).toMatch(/^ddt_/);
  await expect(staleKey.token()).rejects.toMatchObject({ name: 'HubApiError' }); // the old key stays revoked
  device = repaired;

  const [pushed] = await device.push([upsertOp('favorite', 'tool:hash', favoritePayload('hash', 4), null)]);
  expect(pushed?.status).toBe('applied');
  const afterKeys = (await device.changes(0)).filter((r) => !r.deleted && r.entityType === 'favorite').map((r) => `${r.entityType}:${r.entityId}`);
  for (const key of t1FavoriteKeys) expect(afterKeys, key).toContain(key);
  expect(afterKeys).toContain('favorite:tool:hash');

  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByTestId(`device-row-${device.deviceId}`).getByTestId('needs-re-pair')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId(`device-row-${device.deviceId}`)).toHaveCount(1);

  await page.goto('/settings/backup');
  await expect(page.getByTestId('authority-state')).toContainText('Active', { timeout: 30_000 });
  await expect(page.getByTestId('authority-epoch')).toHaveText(String(t1Epoch + 1));
  await expect(page.getByTestId('passphrase-warning')).toContainText('unrecoverable');
  await expect(page.getByTestId('re-pair-none')).toBeVisible();
  await close();

  // The audit trail of the restored Hub records the restore (owner bearer from the re-paired device).
  const audit = await hubClient(t2.target).listAudit(await device.ownerBearer(PASSWORD), { limit: 200 });
  expect(audit.events.map((e) => e.event)).toContain('backup.restored');
  expect(JSON.stringify(audit.events)).not.toContain(BACKUP_PASSPHRASE);
});

test('5. negative checks: refused without the typed phrases, wrong passphrase changes nothing', async () => {
  test.setTimeout(420_000);

  // A plain (not for transfer) backup of the running T2, made before it is stopped.
  const plainBase = ['backup', 'create', '--folder', dirs.plainBackups, '--data-dir', dirs.t2];
  const plainToken = await preview(plainBase);
  const created = await runHubCli([...plainBase, '--confirm', plainToken], { env: passEnv(), timeoutMs: 180_000 });
  expect(created.code, created.stderr).toBe(0);
  expect(jsonOf(created.stdout)['retired']).toBeUndefined();
  const plainFile = path.join(dirs.plainBackups, backupFilesIn(dirs.plainBackups)[0]!);
  expect((await pinnedTransport(t2.target).request({ method: 'GET', path: '/api/v1/hello' })).body).toMatchObject({ authorityState: 'active' }); // a plain backup retires nothing

  // Restore is offline: it refuses while T2 runs, then T2 is stopped for the rest of the checks.
  const whileRunning = await runHubCli(['backup', 'restore', '--file', transferFile, '--data-dir', dirs.t2], { env: passEnv() });
  expect(whileRunning.code).toBe(2);
  await t2.stop();

  // Wrong passphrase against an existing Hub directory: a clean failure and not one byte changed.
  const before = fingerprint(dirs.t2);
  const wrong = await runHubCli(['backup', 'restore', '--file', transferFile, '--data-dir', dirs.t2], { env: passEnv(WRONG_PASSPHRASE) });
  expect(wrong.code).toBe(1);
  expect(wrong.stderr).toMatch(/passphrase is wrong or the file is damaged/i);
  expect(wrong.stderr).not.toContain(WRONG_PASSPHRASE);
  expect(fingerprint(dirs.t2)).toBe(before);

  // Wrong passphrase against an empty directory leaves it without a Hub.
  const wrongFresh = await runHubCli(['backup', 'restore', '--file', transferFile, '--data-dir', dirs.t3], { env: passEnv(WRONG_PASSPHRASE) });
  expect(wrongFresh.code).toBe(1);
  expect(existsSync(path.join(dirs.t3, 'data', 'dude.db'))).toBe(false);

  // Restoring over the now non-empty T2 directory needs the typed replace phrase; the token is not spent and nothing changes.
  const replaceBase = ['backup', 'restore', '--file', transferFile, '--data-dir', dirs.t2];
  const replaceToken = await preview(replaceBase, passEnv());
  const afterPreview = fingerprint(dirs.t2);
  const refused = await runHubCli([...replaceBase, '--confirm', replaceToken], { env: passEnv() });
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain(REPLACE_PHRASE);
  expect(fingerprint(dirs.t2)).toBe(afterPreview);
  const wrongPhrase = await runHubCli([...replaceBase, '--confirm', replaceToken, '--replace', 'replace hub data'], { env: passEnv() });
  expect(wrongPhrase.code).toBe(1);
  expect(fingerprint(dirs.t2)).toBe(afterPreview);

  // A non-transfer backup needs "the old Hub is gone" on a fresh directory, and restores with it.
  const plainRestore = ['backup', 'restore', '--file', plainFile, '--data-dir', dirs.t3];
  const plainRestoreToken = await preview(plainRestore, passEnv());
  const noPhrase = await runHubCli([...plainRestore, '--confirm', plainRestoreToken], { env: passEnv() });
  expect(noPhrase.code).toBe(1);
  expect(noPhrase.stderr).toContain(OLD_HUB_GONE_PHRASE);
  expect(existsSync(path.join(dirs.t3, 'data', 'dude.db'))).toBe(false);
  const withPhrase = await runHubCli([...plainRestore, '--confirm', plainRestoreToken, '--old-hub-gone', OLD_HUB_GONE_PHRASE], { env: passEnv(), timeoutMs: 180_000 });
  expect(withPhrase.code, withPhrase.stderr).toBe(0);
  expect(existsSync(path.join(dirs.t3, 'data', 'dude.db'))).toBe(true);
  expect(jsonOf(withPhrase.stdout)['authorityEpoch']).toBe(t1Epoch + 2);

  // The refused commands left T2 intact: it starts again as the same Hub, at the same epoch, with the owner able to sign in.
  t2 = await startHub(dirs.t2);
  const hello = await hubClient(t2.target).hello();
  expect(hello).toMatchObject({ hubInstanceId: t2InstanceId, authorityEpoch: t1Epoch + 1, authorityState: 'active' });
  device = device.moveTo(t2.target);
  expect(await device.token()).toMatch(/^ddt_/);
});

test('6. backup reactivate returns the original T1 to service at epoch + 1 (the rollback when no restore happened)', async () => {
  test.setTimeout(300_000);
  await t2.stop();
  const original = await startHub(dirs.t1);
  const hello = await hubClient(original.target).hello();
  expect(hello).toMatchObject({ hubInstanceId: t1InstanceId, authorityState: 'transferred', authorityEpoch: t1Epoch });

  const base = ['backup', 'reactivate', '--data-dir', dirs.t1];
  const token = await preview(base);
  expect((await hubClient(original.target).hello()).authorityState).toBe('transferred'); // the preview changes nothing
  const applied = await runHubCli([...base, '--confirm', token]);
  expect(applied.code, applied.stderr).toBe(0);

  await expect.poll(async () => (await hubClient(original.target).hello()).authorityState, { timeout: 30_000 }).toBe('active');
  expect(await hubClient(original.target).hello()).toMatchObject({ hubInstanceId: t1InstanceId, authorityEpoch: t1Epoch + 1 });

  const { page, close } = await openBrowser(original.target);
  await signInAsOwner(page, PASSWORD);
  await page.goto('/settings/backup');
  await expect(page.getByTestId('authority-state')).toContainText('Active', { timeout: 30_000 });
  await expect(page.getByTestId('authority-epoch')).toHaveText(String(t1Epoch + 1));
  await close();
});
