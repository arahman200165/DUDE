import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMeta, setMeta } from '@dude/sqlite-store';
import { applyBackupConfigChange, defaultHubConfig, writeHubConfig } from '../config/hub-config.js';
import type { HubBackupDestinationConfig, HubConfig } from '../config/hub-config.js';
import type { HubDb } from '../db/open-hub-db.js';
import { readDestinationState } from '../hub/backup-destination-state.js';
import { createJobRegistry } from '../jobs/job-status.js';
import { makeRepositoryFolder, memoryMasterKeys, openFixtureHub, randomCheapDeps, seedHubDb, tempRoot } from './backup-fixture.js';
import type { BackupV2AuditFn } from './run-backup-v2.js';
import { BACKUP_RETRY_AFTER_FAILURE_MS, BACKUP_SCHEDULER_CHECK_MS, createBackupScheduler } from './scheduler.js';
import type { BackupSchedulerOptions } from './scheduler.js';

const PASSPHRASE = 'scheduled passphrase for tests';
const HOUR = 3_600_000;
const roots: string[] = [];
const hubs: HubDb[] = [];
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Options { schedule?: boolean; destinations?: number; key?: boolean; intervalHours?: number; brokenSecond?: boolean }

async function fixture(options: Options = {}) {
  const root = tempRoot('sched');
  roots.push(root);
  const { hub, paths } = openFixtureHub(root);
  hubs.push(hub);
  seedHubDb(hub.db);
  let clock = Date.parse('2026-10-04T12:00:00Z');
  const deps = randomCheapDeps(() => new Date(clock));
  const keys = memoryMasterKeys();
  const master = new Uint8Array(32).fill(9);
  const definitions: HubBackupDestinationConfig[] = [];
  for (let i = 0; i < (options.destinations ?? 2); i += 1) {
    const folder = path.join(root, `dest-${i}`);
    if (options.brokenSecond === true && i === 1) mkdirSync(folder, { recursive: true }); // no repository
    else await makeRepositoryFolder(folder, { passphrase: PASSPHRASE, deps, masterKey: master });
    definitions.push({ id: `d-${i}`, kind: 'local-folder', label: `Destination ${i}`, folder });
  }
  if (options.key !== false) keys.save(master);
  let config: HubConfig = applyBackupConfigChange(defaultHubConfig(), { destinations: definitions });
  if (options.schedule !== false) config = applyBackupConfigChange(config, { schedule: { intervalHours: options.intervalHours ?? 24 } });
  writeHubConfig(paths.configFile, config);
  const events: Array<{ event: string; outcome: string; detail: Record<string, unknown> }> = [];
  const audit: BackupV2AuditFn = (event, outcome, detail) => void events.push({ event, outcome, detail });
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const make = (extra: Partial<BackupSchedulerOptions> = {}) => createBackupScheduler({
    db: hub.db, paths, hubVersion: '9.9.9', hubInstanceId: hub.hubInstanceId, readConfig: () => config, masterKeys: keys, deps, now: () => clock, audit,
    setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimer: (handle) => { (handle as { cleared: boolean }).cleared = true; },
    ...extra,
  });
  return {
    root, hub, paths, events, timers, keys, definitions, scheduler: make(), make,
    advance: (ms: number) => { clock += ms; },
    manifests: (i: number): string[] => { const dir = path.join(definitions[i]!.folder, 'manifests'); return existsSync(dir) ? readdirSync(dir).filter((n) => !n.endsWith('.part')).sort() : []; },
    last: () => (getMeta(hub.db, 'backup_last') === undefined ? null : JSON.parse(getMeta(hub.db, 'backup_last')!)),
    state: (i: number) => readDestinationState(hub.db, definitions[i]!.id),
    setConfig: (next: HubConfig) => { config = next; },
  };
}

describe('backup scheduler (backup v2, Milestone 847)', () => {
  it('does nothing when no schedule is configured', async () => {
    const f = await fixture({ schedule: false });
    expect(await f.scheduler.runNow()).toBe('not-configured');
    expect(f.manifests(0)).toEqual([]);
    expect(f.last()).toBeNull();
    expect(f.events).toEqual([]);
  });

  it('runs every due destination with the held master key: a verified v2 backup each, per-destination state, audit and backup_last', async () => {
    const f = await fixture();
    expect(await f.scheduler.runNow()).toBe('created');
    expect(f.manifests(0)).toHaveLength(1);
    expect(f.manifests(1)).toHaveLength(1);
    for (const i of [0, 1]) {
      expect(f.state(i)).toMatchObject({ lastOutcome: 'success', lastSuccessAt: '2026-10-04T12:00:00.000Z', lastBackupId: f.manifests(i)[0], lastVerifiedAt: '2026-10-04T12:00:00.000Z' });
      expect(f.state(i).repoBytes).toBeGreaterThan(0);
    }
    expect(f.events.map((e) => `${e.event}:${String(e.detail['destination'])}`)).toEqual(['backup.v2-created:d-0', 'backup.v2-verified:d-0', 'backup.v2-created:d-1', 'backup.v2-verified:d-1']);
    expect(f.events.every((e) => e.detail['trigger'] === 'schedule')).toBe(true);
    expect(f.last()).toMatchObject({ ok: true, file: f.manifests(1)[0] });
    expect(JSON.stringify(f.events)).not.toContain(PASSPHRASE);
    expect(JSON.stringify(f.events)).not.toContain(f.root);
  });

  it('is not due before the interval, runs again after it, and never prunes', async () => {
    const f = await fixture({ intervalHours: 24 });
    expect(await f.scheduler.runNow()).toBe('created');
    f.advance(24 * HOUR - 1);
    expect(await f.scheduler.runNow()).toBe('not-due');
    f.advance(1);
    expect(await f.scheduler.runNow()).toBe('created');
    for (let day = 0; day < 3; day += 1) {
      f.advance(24 * HOUR);
      expect(await f.scheduler.runNow()).toBe('created');
    }
    expect(f.manifests(0)).toHaveLength(5);
    expect(f.events.some((e) => e.event === 'backup.v2-pruned')).toBe(false);
  });

  it('isolates failures per destination and retries the failed one after the back-off only', async () => {
    const f = await fixture({ brokenSecond: true, intervalHours: 24 });
    expect(await f.scheduler.runNow()).toBe('failed');
    expect(f.manifests(0)).toHaveLength(1);
    expect(f.state(0)).toMatchObject({ lastOutcome: 'success' });
    expect(f.state(1)).toMatchObject({ lastOutcome: 'failure', lastError: 'repository-missing' });
    expect(f.last()).toMatchObject({ ok: false, error: 'repository-missing' });
    expect(f.events.find((e) => e.event === 'backup.v2-failed')).toMatchObject({ outcome: 'failure', detail: { destination: 'd-1', reason: 'repository-missing', trigger: 'schedule' } });

    f.advance(BACKUP_RETRY_AFTER_FAILURE_MS - 1);
    expect(await f.scheduler.runNow()).toBe('not-due');
    f.advance(1);
    const before = f.events.length;
    expect(await f.scheduler.runNow()).toBe('failed');
    // Only the failed destination was due again.
    expect(f.events.slice(before).map((e) => e.event)).toEqual(['backup.v2-failed']);
    expect(f.manifests(0)).toHaveLength(1);

    await makeRepositoryFolder(f.definitions[1]!.folder, { passphrase: PASSPHRASE, deps: randomCheapDeps(), masterKey: new Uint8Array(32).fill(9) });
    f.advance(BACKUP_RETRY_AFTER_FAILURE_MS);
    expect(await f.scheduler.runNow()).toBe('created');
    expect(f.manifests(1)).toHaveLength(1);
  });

  it('records a missing or unreadable master key per due destination without writing anything', async () => {
    const f = await fixture({ key: false });
    expect(await f.scheduler.runNow()).toBe('failed');
    expect(f.manifests(0)).toEqual([]);
    expect(f.last()).toMatchObject({ ok: false, error: 'master-key-missing' });
    expect(f.state(0)).toMatchObject({ lastOutcome: 'failure', lastError: 'master-key-missing' });
    expect(f.events.filter((e) => e.event === 'backup.v2-failed').map((e) => e.detail['destination'])).toEqual(['d-0', 'd-1']);

    const g = await fixture();
    const broken = g.make({ masterKeys: { ...g.keys, load: () => { throw new Error('unreadable'); } } });
    expect(await broken.runNow()).toBe('failed');
    expect(g.last()).toMatchObject({ ok: false, error: 'master-key-unreadable' });
    expect(g.manifests(0)).toEqual([]);
  });

  it('a schedule without any destination (a 31G schedule not set again) fails with no-destination', async () => {
    const f = await fixture({ destinations: 0 });
    expect(await f.scheduler.runNow()).toBe('failed');
    expect(f.last()).toMatchObject({ ok: false, error: 'no-destination' });
    expect(f.events).toEqual([{ event: 'backup.v2-failed', outcome: 'failure', detail: { reason: 'no-destination', trigger: 'schedule' } }]);
  });

  it('never throws out of a run: a bad config, a throwing audit and a concurrent call are all contained', async () => {
    const f = await fixture({ destinations: 1 });
    const broken = f.make({ readConfig: () => { throw new Error('config is not valid'); } });
    await expect(broken.runNow()).resolves.toBe('failed');

    const loud = f.make({ audit: () => { throw new Error('audit unavailable'); } });
    await expect(loud.runNow()).resolves.toBe('created');
    expect(f.last()).toMatchObject({ ok: true });

    const f2 = await fixture({ destinations: 1 });
    const first = f2.scheduler.runNow();
    await expect(f2.scheduler.runNow()).resolves.toBe('busy');
    await expect(first).resolves.toBe('created');
  });

  it('start arms one repeating timer every ten minutes, stop clears it, and a tick runs the check', async () => {
    const f = await fixture({ destinations: 1 });
    f.scheduler.start();
    f.scheduler.start();
    expect(f.timers).toHaveLength(1);
    expect(f.timers[0]!.ms).toBe(BACKUP_SCHEDULER_CHECK_MS);
    expect(BACKUP_SCHEDULER_CHECK_MS).toBe(10 * 60_000);
    f.timers[0]!.fn();
    await vi.waitFor(() => expect(f.state(0).lastOutcome).toBe('success'), { timeout: 10_000 });
    expect(f.manifests(0)).toHaveLength(1);
    f.scheduler.stop();
    expect(f.timers[0]!.cleared).toBe(true);
    f.scheduler.stop();
    f.scheduler.start();
    expect(f.timers).toHaveLength(2);
  });

  it('reads the configuration on every check, so turning the schedule off takes effect without a restart', async () => {
    const f = await fixture({ destinations: 1, intervalHours: 1 });
    expect(await f.scheduler.runNow()).toBe('created');
    f.setConfig(applyBackupConfigChange(applyBackupConfigChange(defaultHubConfig(), { destinations: f.definitions }), { schedule: null }));
    f.advance(2 * HOUR);
    expect(await f.scheduler.runNow()).toBe('not-configured');
    expect(f.manifests(0)).toHaveLength(1);
  });

  it('reports each timer check to the job registry without changing the outcome', async () => {
    const f = await fixture({ schedule: false });
    const jobs = createJobRegistry({ db: f.hub.db });
    const timed = f.make({ job: jobs.handle('backup-schedule') });
    timed.start();
    f.timers[0]!.fn();
    await vi.waitFor(() => expect(jobs.list().find((j) => j.id === 'backup-schedule')).toMatchObject({ running: false, lastOutcome: 'skipped', lastSummary: 'No backup schedule is configured.' }));

    const configured = await fixture({ destinations: 1 });
    const jobs2 = createJobRegistry({ db: configured.hub.db });
    const created = configured.make({ job: jobs2.handle('backup-schedule') });
    created.start();
    configured.timers[0]!.fn();
    await vi.waitFor(() => expect(jobs2.list().find((j) => j.id === 'backup-schedule')).toMatchObject({ lastOutcome: 'success', lastSummary: 'Scheduled backups were created and verified.' }), { timeout: 10_000 });
  });

  it('calls onCheck with the interval after each check that found a schedule, and a throwing observer changes nothing', async () => {
    const none = await fixture({ schedule: false });
    const seenNone: number[] = [];
    expect(await none.make({ onCheck: ({ intervalHours }) => void seenNone.push(intervalHours) }).runNow()).toBe('not-configured');
    expect(seenNone).toEqual([]);

    const f = await fixture({ intervalHours: 6, destinations: 1 });
    const seen: number[] = [];
    const watched = f.make({ onCheck: ({ intervalHours }) => void seen.push(intervalHours) });
    expect(await watched.runNow()).toBe('created');
    expect(await watched.runNow()).toBe('not-due');
    expect(seen).toEqual([6, 6]);
    const throwing = f.make({ onCheck: () => { throw new Error('observer'); } });
    f.advance(7 * HOUR);
    expect(await throwing.runNow()).toBe('created');
  });

  it('a stale 31G backup_last does not delay a destination that never ran', async () => {
    const f = await fixture({ destinations: 1 });
    setMeta(f.hub.db, 'backup_last', JSON.stringify({ at: '2026-10-04T11:59:00.000Z', ok: true, file: 'dude-hub-old.dudebackup' }));
    expect(await f.scheduler.runNow()).toBe('created');
  });
});
