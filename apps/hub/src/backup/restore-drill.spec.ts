import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadOrCreateHubConfig } from '../config/hub-config.js';
import type { HubDb } from '../db/open-hub-db.js';
import { readDestinationState, updateDestinationState } from '../hub/backup-destination-state.js';
import { makeRepositoryFolder, memoryMasterKeys, openFixtureHub, openSaveSphereFixture, randomCheapDeps, seedHubDb, tempRoot } from './backup-fixture.js';
import { destinationLockKey, tryLockDestination } from './destination-lock.js';
import { createLocalFolderDestination } from './destinations/local-folder.js';
import {
  RESTORE_DRILL_HEADROOM_BYTES, RestoreDrillError, createRestoreDrillScheduler, createRestoreDrillService, restoreDrillScratchRoot, restoreDrillFailureCode, runRestoreDrill,
  summarizeRestoreDrill, sweepRestoreDrillScratch,
} from './restore-drill.js';
import { runBackupV2 } from './run-backup-v2.js';

const PASSPHRASE = 'drill spec passphrase';
const MASTER = new Uint8Array(32).fill(7);
const KIB = 1024;
const DAY = 24 * 3600_000;
const roots: string[] = [];
const hubs: HubDb[] = [];
const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function harness(label: string) {
  const root = tempRoot(label);
  roots.push(root);
  const { hub, paths } = openFixtureHub(root);
  hubs.push(hub);
  seedHubDb(hub.db);
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(paths.configFile, JSON.stringify({
    port: 9123, bind: 'lan',
    exposure: { mode: 'private', names: ['hub.lan'], proxy: { trusted: ['10.0.0.1'], publicOrigin: 'https://hub.lan' } },
    backup: { schedule: { intervalHours: 24 }, destinations: [{ id: 'd-1', kind: 'local-folder', label: 'Spec', folder: path.join(root, 'elsewhere') }] },
  }));
  let clock = Date.parse('2026-10-04T12:00:00Z');
  const now = (): number => clock;
  const ss = openSaveSphereFixture(paths, now);
  closers.push(ss.close);
  const destRoot = tempRoot(`${label}-dest`);
  roots.push(destRoot);
  const deps = randomCheapDeps(() => new Date(clock));
  await makeRepositoryFolder(destRoot, { passphrase: PASSPHRASE, deps, masterKey: MASTER });
  const destination = createLocalFolderDestination({ id: 'd-1', label: 'Spec', folder: destRoot });
  const events: Array<{ event: string; outcome: string; detail: Record<string, unknown> }> = [];
  const audit = (event: string, outcome: string, detail: Record<string, unknown>): void => void events.push({ event, outcome, detail });
  const backup = () => runBackupV2({
    db: hub.db, paths, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, destination, masterKey: MASTER, deps, now, trigger: 'manual',
    saveSphereDb: ss.sdb, chunkSize: 16 * KIB, packBytes: 64 * KIB, audit: () => undefined,
  });
  const drill = (extra: Partial<Parameters<typeof runRestoreDrill>[0]> = {}) => runRestoreDrill({
    db: hub.db, paths, destination, masterKey: MASTER, deps, trigger: 'manual', now, audit, ...extra,
  });
  const scratchRoot = restoreDrillScratchRoot(paths);
  return { root, hub, paths, ss, destRoot, destination, deps, backup, drill, events, now, scratchRoot, advance: (ms: number) => { clock += ms; } };
}

/** Every file under `dir` (relative path to size), skipping `skip` prefixes and SQLite sidecars of the live databases. */
function tree(dir: string, skip: string[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full).replaceAll('\\', '/');
      if (skip.some((s) => rel === s || rel.startsWith(`${s}/`))) continue;
      if (entry.isDirectory()) walk(full);
      else out[rel] = statSync(full).size;
    }
  };
  walk(dir);
  return out;
}

const scratchEntries = (scratchRoot: string): string[] => (existsSync(scratchRoot) ? readdirSync(scratchRoot) : []);

describe('restore drill', () => {
  it('restores the newest verified backup into scratch, records and audits the pass, and leaves nothing behind or outside the scratch directory', { timeout: 120_000 }, async () => {
    const h = await harness('pass');
    await h.ss.add(new Uint8Array(randomBytes(40 * KIB)), 'item-a');
    await h.backup();
    const before = tree(h.root, ['data/dude.db', 'data/dude.db-wal', 'data/dude.db-shm', 'backups/.tmp']);
    const liveHubId = h.hub.hubInstanceId;
    h.advance(1000);
    const result = await h.drill();
    expect(result).toMatchObject({ destinationId: 'd-1', outcome: 'passed', blobs: 1, missingBlobs: 0 });
    expect(result.backupId).toBeTruthy();
    expect(result.bytes).toBeGreaterThan(0);
    expect(readDestinationState(h.hub.db, 'd-1')).toMatchObject({
      lastDrillOutcome: 'success', lastDrillBackupId: result.backupId, lastDrillAt: new Date(h.now()).toISOString(), lastVerifiedAt: new Date(h.now()).toISOString(),
    });
    expect(h.events).toEqual([{ event: 'backup.drill-passed', outcome: 'success', detail: expect.objectContaining({ destination: 'd-1', backupId: result.backupId, trigger: 'manual' }) }]);
    expect(JSON.stringify(h.events)).not.toContain(h.root);
    expect(scratchEntries(h.scratchRoot)).toEqual([]);
    // Nothing outside backups/.tmp was written (the live databases are the Hub's own and only gained the state row), and the live identity is unchanged.
    expect(tree(h.root, ['data/dude.db', 'data/dude.db-wal', 'data/dude.db-shm', 'backups/.tmp'])).toEqual(before);
    expect(h.hub.hubInstanceId).toBe(liveHubId);
    // The destination was only read.
    expect(readdirSync(path.join(h.destRoot, 'manifests')).filter((n) => n.endsWith('.part'))).toEqual([]);
  });

  it('fails on a corrupted pack with a short code, records the failure, never a pass, and sweeps its scratch directory', { timeout: 120_000 }, async () => {
    const h = await harness('corrupt');
    await h.ss.add(new Uint8Array(randomBytes(40 * KIB)), 'item-a');
    await h.backup();
    const packs = readdirSync(path.join(h.destRoot, 'packs')).filter((n) => !n.endsWith('.part'));
    expect(packs.length).toBeGreaterThan(0);
    const file = path.join(h.destRoot, 'packs', packs[0]!);
    const bytes = readFileSync(file);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    writeFileSync(file, bytes);
    const result = await h.drill();
    expect(result.outcome).toBe('failed');
    expect(result.reason).toMatch(/^[A-Za-z0-9_.-]{1,40}$/);
    const state = readDestinationState(h.hub.db, 'd-1');
    expect(state).toMatchObject({ lastDrillOutcome: 'failure', lastDrillError: result.reason });
    expect(state.lastDrillSuccessAt).toBeUndefined();
    expect(h.events).toMatchObject([{ event: 'backup.drill-failed', outcome: 'failure', detail: { destination: 'd-1', reason: result.reason } }]);
    expect(JSON.stringify(h.events)).not.toContain(h.root);
    expect(scratchEntries(h.scratchRoot)).toEqual([]);
  });

  it('skips and records nothing when the destination holds no manifest, or only a backup its journal marks unverified', { timeout: 120_000 }, async () => {
    const h = await harness('nomanifest');
    expect(await h.drill()).toMatchObject({ outcome: 'skipped', reason: 'no-backup' });
    expect(readDestinationState(h.hub.db, 'd-1').lastDrillOutcome).toBeUndefined();
    expect(h.events).toEqual([]);
    await h.backup();
    const [manifest] = readdirSync(path.join(h.destRoot, 'manifests'));
    rmSync(path.join(h.destRoot, 'manifests', manifest!));
    expect(await h.drill()).toMatchObject({ outcome: 'skipped', reason: 'no-backup' });
    expect(scratchEntries(h.scratchRoot)).toEqual([]);
  });

  it('refuses before restoring when the scratch volume lacks the space (restored size times 1.25 plus headroom)', { timeout: 120_000 }, async () => {
    const h = await harness('space');
    await h.ss.add(new Uint8Array(randomBytes(40 * KIB)), 'item-a');
    await h.backup();
    const seen: number[] = [];
    const tight = await h.drill({ freeSpace: (dir) => { seen.push(dir.length); return RESTORE_DRILL_HEADROOM_BYTES; } });
    expect(tight).toMatchObject({ outcome: 'failed', reason: 'insufficient-space' });
    expect(seen.length).toBe(1);
    expect(readDestinationState(h.hub.db, 'd-1')).toMatchObject({ lastDrillOutcome: 'failure', lastDrillError: 'insufficient-space' });
    expect(scratchEntries(h.scratchRoot)).toEqual([]);
    // Unknown free space does not block, and plenty of space passes.
    expect((await h.drill({ freeSpace: () => null })).outcome).toBe('passed');
    expect((await h.drill({ freeSpace: () => 1e15 })).outcome).toBe('passed');
  });

  it('sweeps scratch a killed drill left behind at the start of the next one, and a sweep spares nothing else', { timeout: 120_000 }, async () => {
    const h = await harness('sweep');
    await h.ss.add(new Uint8Array(randomBytes(8 * KIB)), 'item-a');
    await h.backup();
    const stale = path.join(h.scratchRoot, 'drill-deadbeefdeadbeef');
    mkdirSync(path.join(stale, 'data'), { recursive: true });
    writeFileSync(path.join(stale, 'data', 'x'), 'left by a crash');
    const other = path.join(h.paths.backupsDir, '.tmp', 'not-a-drill');
    mkdirSync(other, { recursive: true });
    expect(sweepRestoreDrillScratch(h.paths)).toBe(1);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(other)).toBe(true);
    mkdirSync(stale, { recursive: true });
    expect((await h.drill()).outcome).toBe('passed');
    expect(scratchEntries(h.scratchRoot)).toEqual([]);
  });

  it('records a failure when a restored database fails its check or the process step throws, and still removes the scratch directory', { timeout: 120_000 }, async () => {
    const h = await harness('hooks');
    await h.ss.add(new Uint8Array(randomBytes(8 * KIB)), 'item-a');
    await h.backup();
    const broken = await h.drill({ hooks: { afterRestore: (scratch) => { writeFileSync(path.join(scratch, 'data', 'dude.db'), 'this is not a database'); } } });
    expect(broken.outcome).toBe('failed');
    expect(scratchEntries(h.scratchRoot)).toEqual([]);
    const crashed = await h.drill({ hooks: { afterRestore: () => { throw new Error(`boom at ${h.root}`); } } });
    expect(crashed.outcome).toBe('failed');
    expect(JSON.stringify(h.events)).not.toContain('boom');
    expect(JSON.stringify(h.events)).not.toContain(h.root);
    expect(scratchEntries(h.scratchRoot)).toEqual([]);
  });

  it('is skipped while another operation holds the destination, and shares the lock so a backup answers busy meanwhile', { timeout: 120_000 }, async () => {
    const h = await harness('lock');
    await h.backup();
    const lock = tryLockDestination(destinationLockKey(h.paths.root, 'd-1'), 'backup');
    expect('release' in lock).toBe(true);
    try {
      expect(await h.drill()).toMatchObject({ outcome: 'skipped', reason: 'busy' });
    } finally {
      if ('release' in lock) lock.release();
    }
    expect((await h.drill()).outcome).toBe('passed');
  });

  it('never writes to the destination (its writers throw) and stops without recording on a shutdown abort', { timeout: 120_000 }, async () => {
    const h = await harness('abort');
    await h.ss.add(new Uint8Array(randomBytes(40 * KIB)), 'item-a');
    await h.backup();
    const before = tree(h.destRoot);
    const controller = new AbortController();
    controller.abort({ reason: 'shutdown' });
    await expect(h.drill({ signal: controller.signal })).rejects.toBeTruthy();
    expect(readDestinationState(h.hub.db, 'd-1').lastDrillOutcome).toBeUndefined();
    expect(scratchEntries(h.scratchRoot)).toEqual([]);
    const timeout = new AbortController();
    timeout.abort({ reason: 'timeout' });
    expect(await h.drill({ signal: timeout.signal })).toMatchObject({ outcome: 'failed', reason: 'timeout' });
    expect(tree(h.destRoot)).toEqual(before);
  });

  it('maps errors to credential-free short codes', () => {
    expect(restoreDrillFailureCode(new RestoreDrillError('insufficient-space', 'The scratch volume cannot hold the restored Hub.'))).toBe('insufficient-space');
    expect(restoreDrillFailureCode(new Error('C:\\secret\\path broke'))).toMatch(/^[A-Za-z0-9_.-]{1,40}$/);
  });
});

describe('restore drill service and job', () => {
  const setupService = async (label: string) => {
    const h = await harness(label);
    await h.ss.add(new Uint8Array(randomBytes(8 * KIB)), 'item-a');
    await h.backup();
    const masterKeys = memoryMasterKeys();
    masterKeys.save(MASTER);
    let recorded = 0;
    const service = createRestoreDrillService({
      db: h.hub.db, paths: h.paths, readConfig: () => loadOrCreateHubConfig(h.paths.configFile), masterKeys, deps: h.deps, now: h.now,
      openDestination: () => h.destination, audit: (event, outcome, detail) => void h.events.push({ event, outcome, detail }), onRecorded: () => { recorded += 1; },
    });
    return { h, service, masterKeys, recorded: () => recorded };
  };

  it('drills only what is due: a pass waits a month, a failure retries after a day, and nothing is due without a successful backup', { timeout: 120_000 }, async () => {
    const { h, service, recorded } = await setupService('due');
    const first = await service.runDue();
    expect(first.results).toMatchObject([{ destinationId: 'd-1', outcome: 'passed' }]);
    expect(recorded()).toBe(1);
    h.advance(29 * DAY);
    expect((await service.runDue()).results).toEqual([]);
    h.advance(DAY);
    expect((await service.runDue()).results).toMatchObject([{ outcome: 'passed' }]);
    // A failed drill is retried after one day, not a month.
    updateDestinationState(h.hub.db, 'd-1', { lastDrillAt: new Date(h.now()).toISOString(), lastDrillOutcome: 'failure', lastDrillError: 'timeout' });
    h.advance(DAY - 1);
    expect((await service.runDue()).results).toEqual([]);
    h.advance(1);
    expect((await service.runDue()).results).toMatchObject([{ outcome: 'passed' }]);
    expect(readDestinationState(h.hub.db, 'd-1').lastDrillOutcome).toBe('success');
  });

  it('records a failure per destination, with a code, when the master key is missing or unreadable', { timeout: 120_000 }, async () => {
    const { h, service, masterKeys } = await setupService('nokey');
    masterKeys.clear();
    expect((await service.run(undefined, { trigger: 'manual' })).results).toMatchObject([{ destinationId: 'd-1', outcome: 'failed', reason: 'master-key-missing' }]);
    expect(readDestinationState(h.hub.db, 'd-1')).toMatchObject({ lastDrillOutcome: 'failure', lastDrillError: 'master-key-missing' });
    expect(h.events).toMatchObject([{ event: 'backup.drill-failed', detail: { reason: 'master-key-missing' } }]);
  });

  it('runs named destinations on demand, due or not, and zeroes its key copy', { timeout: 120_000 }, async () => {
    const { service, masterKeys, h } = await setupService('manual');
    expect((await service.run(['unknown'], { trigger: 'manual' })).results).toEqual([]);
    expect((await service.run(['d-1'], { trigger: 'manual' })).results).toMatchObject([{ outcome: 'passed' }]);
    expect((await service.run(['d-1'], { trigger: 'manual' })).results).toMatchObject([{ outcome: 'passed' }]);
    expect(masterKeys.key()).toEqual(MASTER);
    expect(h.events.filter((e) => e.event === 'backup.drill-passed')).toHaveLength(2);
  });

  it('the job checks on a timer, reports skipped, success or failed, and stops without a timer left', async () => {
    const reports: Array<{ outcome: string; summary: string }> = [];
    const timers: Array<() => void> = [];
    let cleared = 0;
    const results: Array<{ destinationId: string; outcome: 'passed' | 'failed' | 'skipped'; reason?: string }[]> = [[], [{ destinationId: 'd-1', outcome: 'passed' }], [{ destinationId: 'd-1', outcome: 'failed', reason: 'timeout' }]];
    const scheduler = createRestoreDrillScheduler({
      service: { runDue: () => Promise.resolve({ results: results.shift() ?? [] }), run: () => Promise.resolve({ results: [] }) },
      setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => { cleared += 1; },
      job: { track: (run, classify) => { const out = run(); void (out as Promise<never>).then((r) => { if (classify) reports.push(classify(r)); }); return out; } },
    });
    scheduler.start();
    scheduler.start();
    expect(timers).toHaveLength(1);
    for (let i = 0; i < 3; i += 1) { timers[0]!(); await new Promise((resolve) => setTimeout(resolve, 5)); }
    expect(reports.map((r) => r.outcome)).toEqual(['skipped', 'success', 'failed']);
    expect(reports[2]!.summary).toContain('FAILED');
    scheduler.stop();
    expect(cleared).toBe(1);
  });

  it('summarizes a report in one credential-free sentence', () => {
    expect(summarizeRestoreDrill({ results: [] })).toEqual({ summary: 'No backup destination is due for a restore drill.', attention: false });
    expect(summarizeRestoreDrill({ results: [{ destinationId: 'a', outcome: 'passed' }, { destinationId: 'b', outcome: 'failed', reason: 'C:\\x' }] })).toEqual({
      summary: 'Restore drill passed for 1 destination, FAILED for 1 destination. See the backup status.', attention: true,
    });
    expect(summarizeRestoreDrill({ results: [{ destinationId: 'a', outcome: 'skipped', reason: 'no-backup' }] }).summary).toBe('No verified backup to drill yet.');
  });
});
