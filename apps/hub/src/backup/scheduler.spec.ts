import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deriveBackupKey, openBackup } from '@dude/hub-backup';
import type { BackupDeps } from '@dude/hub-backup';
import { getMeta, setMeta } from '@dude/sqlite-store';
import { applyBackupScheduleChange, defaultHubConfig, writeHubConfig } from '../config/hub-config.js';
import type { HubConfig } from '../config/hub-config.js';
import type { HubDb } from '../db/open-hub-db.js';
import type { CaKeyProtector } from '../tls/ca-key-protector.js';
import { cheapDeps, openFixtureHub, seedHubDb, tempRoot } from './backup-fixture.js';
import { BACKUP_RETRY_AFTER_FAILURE_MS, BACKUP_SCHEDULER_CHECK_MS, createBackupScheduler } from './scheduler.js';
import type { BackupAuditFn, BackupSchedulerOptions } from './scheduler.js';
import { saveScheduleKey } from './schedule-key.js';

const PASSPHRASE = 'scheduled passphrase for tests';
const HOUR = 3_600_000;
const roots: string[] = [];
const hubs: HubDb[] = [];
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fakeProtector: CaKeyProtector = {
  kind: 'dpapi',
  keyFile: 'schedule-key.bin',
  protect: (plain) => Buffer.from(plain.map((b) => b ^ 0x5a)),
  unprotect: (blob) => Buffer.from(blob.map((b) => b ^ 0x5a)),
};

interface Options { schedule?: boolean; key?: boolean; retention?: number; intervalHours?: number; deps?: (now: () => Date) => BackupDeps }

async function fixture(options: Options = {}) {
  const root = tempRoot('sched');
  roots.push(root);
  const { hub, paths } = openFixtureHub(root);
  hubs.push(hub);
  seedHubDb(hub.db);
  const folder = path.join(root, 'out');
  let clock = Date.parse('2026-10-04T12:00:00Z');
  const baseDeps = cheapDeps(() => new Date(clock));
  const deps = options.deps ? options.deps(() => new Date(clock)) : baseDeps;
  let config: HubConfig = defaultHubConfig();
  if (options.schedule !== false) config = applyBackupScheduleChange(config, { folder, intervalHours: options.intervalHours ?? 24, retention: options.retention ?? 3 });
  writeHubConfig(paths.configFile, config);
  if (options.key !== false) saveScheduleKey(paths.configDir, await deriveBackupKey(PASSPHRASE, baseDeps), fakeProtector);
  const events: Array<{ event: string; outcome: string; detail: Record<string, unknown> }> = [];
  const audit: BackupAuditFn = (event, outcome, detail) => void events.push({ event, outcome, detail });
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const make = (extra: Partial<BackupSchedulerOptions> = {}) => createBackupScheduler({
    db: hub.db, paths, hubVersion: '9.9.9', hubInstanceId: hub.hubInstanceId, readConfig: () => config, protector: fakeProtector, deps, now: () => clock, audit,
    setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimer: (handle) => { (handle as { cleared: boolean }).cleared = true; },
    ...extra,
  });
  return {
    root, hub, paths, folder, events, timers, scheduler: make(), make,
    advance: (ms: number) => { clock += ms; },
    names: (): string[] => (existsSync(folder) ? readdirSync(folder).sort() : []),
    last: () => (getMeta(hub.db, 'backup_last') === undefined ? null : JSON.parse(getMeta(hub.db, 'backup_last')!)),
    seedOld: (...stamps: string[]) => {
      mkdirSync(folder, { recursive: true });
      for (const stamp of stamps) writeFileSync(path.join(folder, `dude-hub-${stamp}.dudebackup`), 'old');
    },
    setLast: (value: unknown) => setMeta(hub.db, 'backup_last', JSON.stringify(value)),
  };
}

describe('backup scheduler', () => {
  it('does nothing when no schedule is configured', async () => {
    const f = await fixture({ schedule: false });
    expect(await f.scheduler.runNow()).toBe('not-configured');
    expect(existsSync(f.folder)).toBe(false);
    expect(f.events).toEqual([]);
    expect(f.last()).toBeNull();
  });

  it('does nothing before the interval has elapsed', async () => {
    const f = await fixture({ intervalHours: 24 });
    f.setLast({ at: new Date(Date.parse('2026-10-04T12:00:00Z') - 23 * HOUR).toISOString(), ok: true, file: 'x', size: 1 });
    expect(await f.scheduler.runNow()).toBe('not-due');
    expect(f.names()).toEqual([]);
    expect(f.events).toEqual([]);
  });

  it('runs when due: writes a verified file the passphrase opens, records the outcome and audits it by name', async () => {
    const f = await fixture({ intervalHours: 24 });
    f.setLast({ at: new Date(Date.parse('2026-10-04T12:00:00Z') - 24 * HOUR).toISOString(), ok: true, file: 'x', size: 1 });
    expect(await f.scheduler.runNow()).toBe('created');
    expect(f.names()).toEqual(['dude-hub-20261004T120000Z.dudebackup']);
    const file = path.join(f.folder, f.names()[0]!);
    const last = f.last();
    expect(last).toEqual({ at: '2026-10-04T12:00:00.000Z', ok: true, file: 'dude-hub-20261004T120000Z.dudebackup', size: readFileSync(file).length });
    expect(f.events).toEqual([{ event: 'backup.created', outcome: 'success', detail: { file: last.file, size: last.size, trigger: 'schedule' } }]);

    // The scheduled file was sealed with the stored derived key; the passphrase re-derives it from the salt in the header.
    const opened = await openBackup(new Uint8Array(readFileSync(file)), { passphrase: PASSPHRASE }, cheapDeps());
    expect(opened.manifest).toMatchObject({ forTransfer: false, hubVersion: '9.9.9', source: { hubInstanceId: f.hub.hubInstanceId, authorityEpoch: 3 } });
    expect(existsSync(path.join(f.paths.backupsDir, '.tmp')) ? readdirSync(path.join(f.paths.backupsDir, '.tmp')) : []).toEqual([]);
  });

  it('runs the first time when nothing was ever recorded, then waits an interval', async () => {
    const f = await fixture({ intervalHours: 6 });
    expect(await f.scheduler.runNow()).toBe('created');
    f.advance(6 * HOUR - 1000);
    expect(await f.scheduler.runNow()).toBe('not-due');
    f.advance(1000);
    expect(await f.scheduler.runNow()).toBe('created');
    expect(f.names()).toHaveLength(2);
  });

  it('prunes to the retention count after a success and audits only the count', async () => {
    const f = await fixture({ retention: 2 });
    f.seedOld('20260101T000000Z', '20260102T000000Z', '20260103T000000Z', '20260104T000000Z');
    writeFileSync(path.join(f.folder, 'keep-me.txt'), 'foreign');
    expect(await f.scheduler.runNow()).toBe('created');
    expect(f.names()).toEqual(['dude-hub-20260104T000000Z.dudebackup', 'dude-hub-20261004T120000Z.dudebackup', 'keep-me.txt']);
    expect(f.events.map((e) => e.event)).toEqual(['backup.created', 'backup.pruned']);
    expect(f.events[1]).toEqual({ event: 'backup.pruned', outcome: 'success', detail: { count: 3 } });
  });

  it('writes no pruned event when nothing needed deleting', async () => {
    const f = await fixture({ retention: 5 });
    f.seedOld('20260101T000000Z');
    await f.scheduler.runNow();
    expect(f.events.map((e) => e.event)).toEqual(['backup.created']);
  });

  it('a failed run records a code only, audits it and never prunes', async () => {
    const f = await fixture({
      retention: 1,
      deps: (now) => ({ ...cheapDeps(now), randomBytes: () => { throw new Error(`boom ${PASSPHRASE} /secret/path`); } }),
    });
    f.seedOld('20260101T000000Z', '20260102T000000Z', '20260103T000000Z');
    expect(await f.scheduler.runNow()).toBe('failed');
    expect(f.names()).toHaveLength(3);
    expect(f.last()).toEqual({ at: '2026-10-04T12:00:00.000Z', ok: false, error: 'create-failed' });
    expect(f.events).toEqual([{ event: 'backup.failed', outcome: 'failure', detail: { reason: 'create-failed', trigger: 'schedule' } }]);
    expect(JSON.stringify([f.events, f.last()])).not.toContain('secret');
    expect(f.names().some((n) => n.endsWith('.part'))).toBe(false);
  });

  it('records a missing schedule key as a failure without creating or pruning anything', async () => {
    const f = await fixture({ key: false, retention: 1 });
    f.seedOld('20260101T000000Z', '20260102T000000Z');
    expect(await f.scheduler.runNow()).toBe('failed');
    expect(f.names()).toHaveLength(2);
    expect(f.last()).toMatchObject({ ok: false, error: 'schedule-key-missing' });
    expect(f.events).toEqual([{ event: 'backup.failed', outcome: 'failure', detail: { reason: 'schedule-key-missing', trigger: 'schedule' } }]);
  });

  it('records a corrupt schedule key as a failure', async () => {
    const f = await fixture();
    writeFileSync(path.join(f.paths.configDir, 'backup', 'schedule-key.bin'), 'garbage');
    expect(await f.scheduler.runNow()).toBe('failed');
    expect(f.last()).toMatchObject({ ok: false, error: 'schedule-key-corrupt' });
    expect(f.events[0]).toMatchObject({ event: 'backup.failed', detail: { reason: 'schedule-key-corrupt' } });
  });

  it('retries a failed run sooner than a long interval, and never before the back-off', async () => {
    const f = await fixture({ intervalHours: 24 * 7 });
    f.setLast({ at: '2026-10-04T12:00:00.000Z', ok: false, error: 'create-failed' });
    f.advance(BACKUP_RETRY_AFTER_FAILURE_MS - 1);
    expect(await f.scheduler.runNow()).toBe('not-due');
    f.advance(1);
    expect(await f.scheduler.runNow()).toBe('created');
    expect(f.last()).toMatchObject({ ok: true });
  });

  it('prunes after a success that follows a failure (the latest backup is verified again)', async () => {
    const f = await fixture({ retention: 1 });
    f.seedOld('20260101T000000Z', '20260102T000000Z');
    f.setLast({ at: '2026-10-04T00:00:00.000Z', ok: false, error: 'EACCES' });
    expect(await f.scheduler.runNow()).toBe('created');
    expect(f.names()).toEqual(['dude-hub-20261004T120000Z.dudebackup']);
  });

  it('never throws out of a run: a bad config, a throwing audit and a concurrent call are all contained', async () => {
    const f = await fixture();
    const broken = f.make({ readConfig: () => { throw new Error('config is not valid'); } });
    await expect(broken.runNow()).resolves.toBe('failed');

    const loud = f.make({ audit: () => { throw new Error('audit unavailable'); } });
    await expect(loud.runNow()).resolves.toBe('created');
    expect(f.last()).toMatchObject({ ok: true });

    const f2 = await fixture();
    const first = f2.scheduler.runNow();
    await expect(f2.scheduler.runNow()).resolves.toBe('busy');
    await expect(first).resolves.toBe('created');
  });

  it('start arms one repeating timer every ten minutes, stop clears it, and a tick runs the check', async () => {
    const f = await fixture();
    f.scheduler.start();
    f.scheduler.start();
    expect(f.timers).toHaveLength(1);
    expect(f.timers[0]!.ms).toBe(BACKUP_SCHEDULER_CHECK_MS);
    expect(BACKUP_SCHEDULER_CHECK_MS).toBe(10 * 60_000);
    f.timers[0]!.fn();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(f.names()).toHaveLength(1);
    f.scheduler.stop();
    expect(f.timers[0]!.cleared).toBe(true);
    f.scheduler.stop();
    f.scheduler.start();
    expect(f.timers).toHaveLength(2);
  });

  it('reads the configuration on every check, so turning the schedule off takes effect without a restart', async () => {
    const f = await fixture();
    let config: HubConfig | undefined;
    const live = f.make({ readConfig: () => config ?? applyBackupScheduleChange(defaultHubConfig(), { folder: f.folder, intervalHours: 1, retention: 3 }) });
    expect(await live.runNow()).toBe('created');
    config = defaultHubConfig();
    f.advance(2 * HOUR);
    expect(await live.runNow()).toBe('not-configured');
    expect(f.names()).toHaveLength(1);
  });
});
