import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { hubClient, type HubTarget } from '../hub/hub-helpers';
import {
  BridgeError, bridgeResult, commitFavorite, createBackup, deviceIdOf, enrollObserver, enrollThroughUi, favoriteIds, firstSyncMergeAll, firstSyncThroughUi,
  hubFavorites, hubStatus, launchDesktop, localFavorites, newPairingString, bootstrapOwner, recoverySnapshots, removeProfile, restoreBackup, spawnReleaseHub, syncStatus,
  waitUntilSynced, type Desktop, type RunningHub,
} from './sync-helpers';

/**
 * Phase 31G exit gate with REAL processes: the release `dude-hub` (CLI and Hubs), two or three real Electron desktops with their resident
 * Device Agents, the real encrypted backup file and the real offline restore. Proven here:
 *
 *  A. a STALE backup (made before the devices moved on) restored as a new Hub at the old address: every device notices the changed
 *     authority, stops talking to it, keeps its records and pending edits, and after the owner's re-attach code plus `hub.reconnect`
 *     and a first-sync MERGE, nothing is lost on either side and the Hub's history is rebuilt from the devices, not replayed blindly;
 *     the old Hub, started again at that address, is refused by the devices.
 *  B. a transfer backup retires the Hub (devices report `transferred`), and the restored Hub at a NEW address with a NEW certificate
 *     takes over through the same reconnect path.
 *
 * Edits are tool favorites committed through the Device State Store (what the app's favorite toggle does), read back from the Hub
 * through an independent simulated device. The epoch-lower refusal (a device reconnecting to an older Hub) is covered by the in-process
 * `hub-authority.spec.ts`: a real Hub cannot be made to accept a re-attach code for a device it still holds as active.
 */
test.describe.configure({ mode: 'serial' });

const hubs: RunningHub[] = [];
const desktops: Desktop[] = [];
const tempRoots: string[] = [];

async function startHub(dataDir: string, port?: number): Promise<RunningHub> {
  const hub = await spawnReleaseHub(dataDir, port === undefined ? {} : { port });
  hubs.push(hub);
  return hub;
}

async function startDesktop(name: string): Promise<Desktop> {
  const desktop = await launchDesktop(name);
  desktops.push(desktop);
  return desktop;
}

function tempRoot(label: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `dude-sync-e2e-${label}-`));
  tempRoots.push(dir);
  return dir;
}

async function closeDesktops(list: Desktop[]): Promise<void> {
  for (const d of list) {
    await d.close();
    removeProfile(d);
  }
}

test.afterAll(async () => {
  await closeDesktops(desktops.splice(0));
  for (const hub of hubs.splice(0)) await hub.stop().catch(() => undefined);
  for (const dir of tempRoots.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {
      // A leftover temp directory is harmless.
    }
  }
});

/** Hello of a Hub as a device's client sees it. */
const hello = (target: HubTarget) => hubClient(target).hello();

/** Real tool ids, so the app's own favorites handling accepts every record. */
const BASELINE_A = 'base64';
const BASELINE_B = 'case-converter';
const AFTER_BACKUP_A1 = 'color-converter';
const AFTER_BACKUP_A2 = 'chmod-converter';
const AFTER_BACKUP_B = 'cidr-calculator';
const OFFLINE_A = 'base-n-encoder';
const OFFLINE_B = 'bigint-calculator';
const BLOCKED_A = 'basic-auth-generator';
const LIVE_B = 'border-radius-generator';
const IMPOSTOR_A = 'ascii-table';

test.describe('Scenario A: a stale backup restored over devices that had moved past it', () => {
  let d1 = '';
  let d2 = '';
  let backups = '';
  let h1: RunningHub;
  let h2: RunningHub;
  let a: Desktop;
  let b: Desktop;
  let h1Instance = '';
  let epoch1 = 0;
  let backupFile = '';
  let h2Instance = '';
  let observer: Awaited<ReturnType<typeof enrollObserver>>;
  let allExpected: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(480_000);
    const root = tempRoot('restore-a');
    d1 = path.join(root, 'hub-1');
    d2 = path.join(root, 'hub-2');
    backups = path.join(root, 'backups');
    for (const dir of [d1, d2, backups]) mkdirSync(dir, { recursive: true });

    h1 = await startHub(d1);
    await bootstrapOwner(h1.target);
    a = await startDesktop('ra');
    b = await startDesktop('rb');
    await enrollThroughUi(a, await newPairingString(h1.target));
    await enrollThroughUi(b, await newPairingString(h1.target));
    await firstSyncThroughUi(a);
    await firstSyncThroughUi(b);
  });

  test('1. both desktops are synced with H1 and share their baseline records', async () => {
    test.setTimeout(240_000);
    const first = await hello(h1.target);
    h1Instance = first.hubInstanceId;
    epoch1 = first.authorityEpoch ?? 1;

    await commitFavorite(a, BASELINE_A, 0);
    await commitFavorite(b, BASELINE_B, 1);
    const baseline = favoriteIds(BASELINE_A, BASELINE_B);
    await expect.poll(() => localFavorites(a), { timeout: 90_000 }).toEqual(baseline);
    await expect.poll(() => localFavorites(b), { timeout: 90_000 }).toEqual(baseline);
    await waitUntilSynced(a);
    await waitUntilSynced(b);
  });

  test('2. a plain (not for transfer) backup of H1 retires nothing', async () => {
    test.setTimeout(300_000);
    backupFile = await createBackup(h1, backups);
    expect(await hello(h1.target)).toMatchObject({ hubInstanceId: h1Instance, authorityState: 'active', authorityEpoch: epoch1 });
  });

  test('3. edits made AFTER the backup reach H1 and both desktops: their cursors are now ahead of the backup', async () => {
    test.setTimeout(240_000);
    await commitFavorite(a, AFTER_BACKUP_A1, 2);
    await commitFavorite(a, AFTER_BACKUP_A2, 3);
    await commitFavorite(b, AFTER_BACKUP_B, 4);
    const moved = favoriteIds(BASELINE_A, BASELINE_B, AFTER_BACKUP_A1, AFTER_BACKUP_A2, AFTER_BACKUP_B);
    await expect.poll(() => localFavorites(a), { timeout: 90_000 }).toEqual(moved);
    await expect.poll(() => localFavorites(b), { timeout: 90_000 }).toEqual(moved);
    await waitUntilSynced(a);
    await waitUntilSynced(b);
    const status = await syncStatus(a);
    expect(status.headRevision ?? 0).toBeGreaterThan(0);
  });

  test('4. H1 is lost: the devices keep editing offline, the OLD backup is restored as H2 at the same address', async () => {
    test.setTimeout(480_000);
    await h1.stop();
    await expect.poll(async () => (await hubStatus(a)).connection, { message: 'A never noticed H1 going away', timeout: 60_000 }).toBe('offline');
    await expect.poll(async () => (await hubStatus(b)).connection, { message: 'B never noticed H1 going away', timeout: 60_000 }).toBe('offline');
    await commitFavorite(a, OFFLINE_A, 5);
    await commitFavorite(b, OFFLINE_B, 6);
    expect((await syncStatus(a)).pending).toBeGreaterThan(0);
    expect((await syncStatus(b)).pending).toBeGreaterThan(0);

    // The backup is not for transfer, so the restore insists on the typed "the old Hub is gone" phrase (the helper passes it).
    const restored = await restoreBackup(backupFile, d2, { oldHubGone: true });
    expect(restored.authorityEpoch).toBe(epoch1 + 1);
    // The Hub never keeps certificate material in a backup; the replacement Hub is given the same certificate (the operator re-installing
    // it) so the devices can reach it and see that the Hub BEHIND the address changed. A fresh certificate is covered by scenario B.
    cpSync(path.join(d1, 'config', 'tls'), path.join(d2, 'config', 'tls'), { recursive: true });
    h2 = await startHub(d2, h1.target.port);
    const second = await hello(h2.target);
    h2Instance = second.hubInstanceId;
    expect(h2Instance).not.toBe(h1Instance);
    expect(second).toMatchObject({ authorityEpoch: epoch1 + 1, authorityState: 'active', bootstrapped: true });
  });

  test('5. both devices detect the changed Hub, stop, keep every record and pending edit, and take one recovery snapshot', async () => {
    test.setTimeout(300_000);
    for (const d of [a, b]) {
      await expect.poll(async () => (await hubStatus(d)).connection, { message: `${d.name} never reported the changed Hub`, timeout: 180_000 }).toBe('authority-changed');
      const status = await hubStatus(d);
      expect(status.authority).toMatchObject({ reason: 'instance-changed', hubInstanceId: h2Instance, epoch: epoch1 + 1 });
      expect(status.enrollmentState).toBe('enrolled'); // not revoked: the enrollment is kept
      expect((await syncStatus(d)).phase).toBe('needs-reconcile');
    }

    // Work done after the stop stays queued; nothing runs against H2.
    await commitFavorite(a, BLOCKED_A, 7);
    for (const d of [a, b]) expect(await bridgeResult<{ phase: string }>(d, 'sync.syncNow')).toMatchObject({ phase: 'needs-reconcile' });
    for (const d of [a, b]) {
      await expect.poll(() => recoverySnapshots(d, 'authority-changed'), { timeout: 60_000 }).toHaveLength(1);
      expect((await syncStatus(d)).pending).toBeGreaterThan(0);
    }

    // H2 still holds exactly what the OLD backup held: nothing was pushed to it, and none of the newer history was replayed to it.
    observer = await enrollObserver(h2.target);
    expect(await hubFavorites(observer)).toEqual(favoriteIds(BASELINE_A, BASELINE_B));

    // The devices keep everything they had, including the edits H2 never saw.
    const everything = favoriteIds(BASELINE_A, BASELINE_B, AFTER_BACKUP_A1, AFTER_BACKUP_A2, AFTER_BACKUP_B, OFFLINE_A, OFFLINE_B, BLOCKED_A);
    expect(await localFavorites(a)).toEqual(everything.filter((id) => id !== `tool:${OFFLINE_B}`));
    expect(await localFavorites(b)).toEqual(everything.filter((id) => id !== `tool:${BLOCKED_A}` && id !== `tool:${OFFLINE_A}`));
  });

  test('6. refusals first: a plain pairing code and an unacknowledged request do not reconnect a device and change nothing', async () => {
    test.setTimeout(180_000);
    const before = { favorites: await localFavorites(a), pending: (await syncStatus(a)).pending };
    const deviceId = await deviceIdOf(a);

    const reattach = await newPairingString(h2.target, { reattachDeviceId: deviceId });
    await expect(bridgeResult(a, 'hub.reconnect', { pairingString: reattach, acknowledged: false })).rejects.toBeInstanceOf(BridgeError);

    // An ordinary code (not bound to this device's restored row) is refused by the Hub for an enrolled desktop.
    const plain = await newPairingString(h2.target);
    await expect(bridgeResult(a, 'hub.reconnect', { pairingString: plain, acknowledged: true })).rejects.toBeInstanceOf(BridgeError);
    await expect.poll(async () => (await hubStatus(a)).connection, { timeout: 60_000 }).toBe('authority-changed');
    expect(await localFavorites(a)).toEqual(before.favorites);
    expect((await syncStatus(a)).pending).toBe(before.pending);
    expect((await hubFavorites(observer)).length).toBe(2);
  });

  test('7. the owner re-attaches each device; each reconnects and merges: no edit is lost on H2 or on the devices', async () => {
    test.setTimeout(420_000);
    for (const d of [a, b]) {
      const pairingString = await newPairingString(h2.target, { reattachDeviceId: await deviceIdOf(d) });
      await bridgeResult(d, 'hub.reconnect', { pairingString, acknowledged: true });
      await expect.poll(async () => (await hubStatus(d)).connection, { message: `${d.name} never came online on H2`, timeout: 90_000 }).toBe('online');
      expect((await hubStatus(d)).authority ?? null).toBeNull();
      // Bookkeeping starts over: the first-sync preview runs again, and nothing was shared before the user chose.
      await expect.poll(async () => (await syncStatus(d)).phase, { timeout: 60_000 }).toBe('needs-first-sync');
      expect(recoverySnapshots(d, 'reconnect').length).toBeGreaterThanOrEqual(1);
      await firstSyncMergeAll(d);
      await waitUntilSynced(d, 120_000);
    }

    allExpected = favoriteIds(BASELINE_A, BASELINE_B, AFTER_BACKUP_A1, AFTER_BACKUP_A2, AFTER_BACKUP_B, OFFLINE_A, OFFLINE_B, BLOCKED_A);
    // (1) every edit H2 never saw, and every pending offline edit, is on H2 now; (2) nothing was deleted (no tombstone, nothing missing).
    await expect.poll(() => hubFavorites(observer), { timeout: 90_000 }).toEqual(allExpected);
    await expect.poll(() => localFavorites(a), { timeout: 90_000 }).toEqual(allExpected);
    await expect.poll(() => localFavorites(b), { timeout: 90_000 }).toEqual(allExpected);
    await waitUntilSynced(a);
    await waitUntilSynced(b);
  });

  test('8. one authority: H2 is the only Hub at the new epoch, and a new edit on B reaches A live through it', async () => {
    test.setTimeout(240_000);
    expect(await hello(h2.target)).toMatchObject({ hubInstanceId: h2Instance, authorityEpoch: epoch1 + 1, authorityState: 'active' });
    for (const d of [a, b]) expect((await hubStatus(d)).connection).toBe('online');

    await commitFavorite(b, LIVE_B, 8);
    await expect.poll(() => localFavorites(a), { timeout: 90_000 }).toEqual(favoriteIds(...[BASELINE_A, BASELINE_B, AFTER_BACKUP_A1, AFTER_BACKUP_A2, AFTER_BACKUP_B, OFFLINE_A, OFFLINE_B, BLOCKED_A, LIVE_B]));
    await expect.poll(() => hubFavorites(observer), { timeout: 90_000 }).toContain(`tool:${LIVE_B}`);
    await waitUntilSynced(a);
    await waitUntilSynced(b);
  });

  test('9. the OLD Hub started again at that address is refused by the devices: nothing reaches it', async () => {
    test.setTimeout(300_000);
    await h2.stop();
    const h1Again = await startHub(d1, h2.target.port);
    expect(await hello(h1Again.target)).toMatchObject({ hubInstanceId: h1Instance, authorityEpoch: epoch1, authorityState: 'active' });
    const stale = await enrollObserver(h1Again.target);
    const staleBefore = await hubFavorites(stale);
    expect(staleBefore).toEqual(favoriteIds(BASELINE_A, BASELINE_B, AFTER_BACKUP_A1, AFTER_BACKUP_A2, AFTER_BACKUP_B));

    for (const d of [a, b]) {
      await expect.poll(async () => (await hubStatus(d)).connection, { message: `${d.name} did not refuse the old Hub`, timeout: 180_000 }).toBe('authority-changed');
      expect((await hubStatus(d)).authority).toMatchObject({ reason: 'instance-changed', hubInstanceId: h1Instance });
      expect((await syncStatus(d)).phase).toBe('needs-reconcile');
    }
    await commitFavorite(a, IMPOSTOR_A, 9);
    for (const d of [a, b]) await bridgeResult(d, 'sync.syncNow');
    expect(await hubFavorites(stale)).toEqual(staleBefore);
    expect(await localFavorites(a)).toContain(`tool:${IMPOSTOR_A}`);
    expect(await localFavorites(a)).toEqual(expect.arrayContaining(allExpected));
  });

  test.afterAll(async () => {
    await closeDesktops([a, b].filter((d): d is Desktop => d !== undefined));
    for (const d of [a, b]) {
      const index = desktops.indexOf(d);
      if (index >= 0) desktops.splice(index, 1);
    }
  });
});

test.describe('Scenario B: a transfer backup retires the Hub and a restored Hub takes over at a new address', () => {
  let h3: RunningHub;
  let h4: RunningHub;
  let c: Desktop;
  let d3 = '';
  let d4 = '';
  let backups = '';
  let h3Instance = '';
  let epoch3 = 0;
  let transferFile = '';

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    const root = tempRoot('restore-b');
    d3 = path.join(root, 'hub-3');
    d4 = path.join(root, 'hub-4');
    backups = path.join(root, 'backups');
    for (const dir of [d3, d4, backups]) mkdirSync(dir, { recursive: true });
    h3 = await startHub(d3);
    await bootstrapOwner(h3.target);
    c = await startDesktop('rc');
    await enrollThroughUi(c, await newPairingString(h3.target));
    await firstSyncThroughUi(c);
    const first = await hello(h3.target);
    h3Instance = first.hubInstanceId;
    epoch3 = first.authorityEpoch ?? 1;
    await commitFavorite(c, BASELINE_A, 0);
    await waitUntilSynced(c);
  });

  test('1. backup create --for-transfer retires H3: the device reports "transferred", stops and keeps its pending edit', async () => {
    test.setTimeout(360_000);
    transferFile = await createBackup(h3, backups, { forTransfer: true });
    expect(await hello(h3.target)).toMatchObject({ hubInstanceId: h3Instance, authorityState: 'transferred', authorityEpoch: epoch3 });

    await expect.poll(async () => (await hubStatus(c)).connection, { message: 'the device never reported the retired Hub', timeout: 120_000 }).toBe('authority-changed');
    expect((await hubStatus(c)).authority).toMatchObject({ reason: 'transferred', hubInstanceId: h3Instance });
    expect((await syncStatus(c)).phase).toBe('needs-reconcile');

    await commitFavorite(c, BASELINE_B, 1);
    expect(await bridgeResult<{ phase: string }>(c, 'sync.syncNow')).toMatchObject({ phase: 'needs-reconcile' });
    expect((await syncStatus(c)).pending).toBeGreaterThan(0);
    await expect.poll(() => recoverySnapshots(c, 'authority-changed'), { timeout: 60_000 }).toHaveLength(1);
    expect(await localFavorites(c)).toEqual(favoriteIds(BASELINE_A, BASELINE_B));
  });

  test('2. restored as H4 at a NEW address with a NEW certificate: re-attach, reconnect and merge land the pending edit', async () => {
    test.setTimeout(420_000);
    await h3.stop();
    // A transfer backup needs no "old Hub is gone" phrase.
    const restored = await restoreBackup(transferFile, d4);
    expect(restored.authorityEpoch).toBe(epoch3 + 1);
    h4 = await startHub(d4);
    expect(h4.target.port).not.toBe(h3.target.port);
    expect(h4.target.spki).not.toBe(h3.target.spki);
    const fourth = await hello(h4.target);
    expect(fourth.hubInstanceId).not.toBe(h3Instance);
    expect(fourth).toMatchObject({ authorityEpoch: epoch3 + 1, authorityState: 'active' });

    const observer = await enrollObserver(h4.target);
    expect(await hubFavorites(observer)).toEqual(favoriteIds(BASELINE_A));

    const pairingString = await newPairingString(h4.target, { reattachDeviceId: await deviceIdOf(c) });
    await bridgeResult(c, 'hub.reconnect', { pairingString, acknowledged: true });
    await expect.poll(async () => (await hubStatus(c)).connection, { timeout: 90_000 }).toBe('online');
    expect((await hubStatus(c)).hubInstanceId).toBe(fourth.hubInstanceId);
    await expect.poll(async () => (await syncStatus(c)).phase, { timeout: 60_000 }).toBe('needs-first-sync');
    expect(recoverySnapshots(c, 'reconnect')).toHaveLength(1);
    await firstSyncMergeAll(c);
    await waitUntilSynced(c, 120_000);

    await expect.poll(() => hubFavorites(observer), { timeout: 90_000 }).toEqual(favoriteIds(BASELINE_A, BASELINE_B));
    expect(await localFavorites(c)).toEqual(favoriteIds(BASELINE_A, BASELINE_B));
  });

  test.afterAll(async () => {
    if (c !== undefined) {
      await closeDesktops([c]);
      const index = desktops.indexOf(c);
      if (index >= 0) desktops.splice(index, 1);
    }
  });
});
