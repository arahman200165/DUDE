import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openBackupV2, openRepository, readRepositoryObject } from '@dude/hub-backup';
import type { HubDb } from '../db/open-hub-db.js';
import { makeRepositoryFolder, openFixtureHub, openSaveSphereFixture, randomCheapDeps, seedHubDb, tempRoot } from './backup-fixture.js';
import { createLocalFolderDestination } from './destinations/local-folder.js';
import { DEFAULT_RETENTION, PruneError, applyPrunePlan, backupIdTime, planPrune, selectRetained } from './retention-v2.js';
import { SimulatedCrash, runBackupV2 } from './run-backup-v2.js';

const PASSPHRASE = 'retention spec passphrase';
const MASTER = new Uint8Array(32).fill(3);
const DAY = 86_400_000;
const roots: string[] = [];
const hubs: HubDb[] = [];
const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A backup id at `ms` (the fake clock), with a distinguishing suffix. */
const idAt = (ms: number, n = 0): string => `${new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${n.toString(16).padStart(32, '0')}`;

describe('GFS retention (7 daily, 4 weekly, 6 monthly)', () => {
  it('is the documented default', () => {
    expect(DEFAULT_RETENTION).toEqual({ daily: 7, weekly: 4, monthly: 6 });
    expect(backupIdTime(idAt(Date.parse('2026-10-27T13:14:15Z')))).toBe(Date.parse('2026-10-27T13:14:15Z'));
    expect(backupIdTime('nope')).toBeNaN();
  });

  it('over a year of daily backups keeps the newest 7 days, the newest of the last 4 ISO weeks and of the last 6 months', () => {
    const start = Date.parse('2025-10-01T02:00:00Z');
    const ids = Array.from({ length: 400 }, (_, i) => idAt(start + i * DAY, i));
    const kept = selectRetained(ids);
    const keptDates = [...kept].map((id) => new Date(backupIdTime(id)).toISOString().slice(0, 10)).sort();
    // Newest backup: 2026-11-04 (a Wednesday). Daily: 2026-10-29..2026-11-04. Weekly (Monday weeks): the newest of each of the 4 newest weeks
    // (2026-11-04 already, then the Sundays 11-01, 10-25, 10-18). Monthly: the newest of Nov (11-04), Oct, Sep, Aug, Jul, Jun.
    expect(keptDates).toEqual([
      '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30',
      '2026-10-18', '2026-10-25', '2026-10-29', '2026-10-30', '2026-10-31',
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
    ]);
    expect(kept.size).toBe(13);
  });

  it('keeps only the newest backup of a day, always keeps the newest overall, and never deletes an undated id', () => {
    const day = Date.parse('2026-10-27T00:00:00Z');
    const sameDay = [idAt(day + 3_600_000, 1), idAt(day + 7_200_000, 2), idAt(day + 10_800_000, 3)];
    expect([...selectRetained(sameDay)]).toEqual([sameDay[2]]);
    expect([...selectRetained(sameDay, { daily: 0, weekly: 0, monthly: 0 })]).toEqual([sameDay[2]]);
    expect(selectRetained([...sameDay, 'not-a-dated-id'], { daily: 1, weekly: 0, monthly: 0 })).toEqual(new Set([sameDay[2], 'not-a-dated-id']));
    expect(selectRetained([])).toEqual(new Set());
  });

  it('a sparse history: gaps are skipped (periods that have backups count, not calendar periods)', () => {
    const ids = [Date.parse('2026-01-15T00:00:00Z'), Date.parse('2026-03-02T00:00:00Z'), Date.parse('2026-10-26T00:00:00Z')].map((t, i) => idAt(t, i));
    expect(selectRetained(ids)).toEqual(new Set(ids));
    expect(selectRetained(ids, { daily: 1, weekly: 1, monthly: 2 })).toEqual(new Set([ids[1], ids[2]]));
  });

  it('ISO weeks across a year boundary group 2026-12-28..2027-01-03 together', () => {
    const ids = ['2026-12-28', '2027-01-03', '2027-01-04'].map((d, i) => idAt(Date.parse(`${d}T12:00:00Z`), i));
    expect(selectRetained(ids, { daily: 0, weekly: 2, monthly: 0 })).toEqual(new Set([ids[1], ids[2]]));
  });
});

async function chain() {
  const root = tempRoot('ret');
  roots.push(root);
  const { hub, paths } = openFixtureHub(root);
  hubs.push(hub);
  seedHubDb(hub.db);
  let clock = Date.parse('2026-10-01T02:00:00Z');
  const ss = openSaveSphereFixture(paths, () => clock);
  closers.push(ss.close);
  const destRoot = tempRoot('ret-dest');
  roots.push(destRoot);
  const deps = randomCheapDeps(() => new Date(clock));
  await makeRepositoryFolder(destRoot, { passphrase: PASSPHRASE, deps, masterKey: MASTER });
  const destination = createLocalFolderDestination({ id: 'd-1', label: 'Spec', folder: destRoot });
  const run = (hooks?: Parameters<typeof runBackupV2>[0]['hooks']) => runBackupV2({
    db: hub.db, paths, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, destination, masterKey: MASTER, deps, now: () => clock, trigger: 'manual',
    saveSphereDb: ss.sdb, audit: () => undefined, chunkSize: 4 * 1024, packBytes: 32 * 1024, ...(hooks ? { hooks } : {}),
  });
  const repository = async () => openRepository(await readRepositoryObject(destination.source()), { masterKey: MASTER }, deps);
  const packs = (): string[] => (existsSync(path.join(destRoot, 'packs')) ? readdirSync(path.join(destRoot, 'packs')).filter((n) => !n.endsWith('.part')).sort() : []);
  return { hub, ss, destination, deps, run, repository, packs, advance: (ms: number) => { clock += ms; }, workDir: path.join(paths.backupsDir, '.tmp') };
}

describe('prune plan and mark-and-sweep of packs', () => {
  it('never sweeps a pack a retained manifest references, even one written by a deleted earlier backup (chained incrementals)', { timeout: 60_000 }, async () => {
    const c = await chain();
    const shared = await c.ss.add(new Uint8Array(randomBytes(96 * 1024)), 'shared'); // written by backup 1, referenced by all three
    const dropped = await c.ss.add(new Uint8Array(randomBytes(96 * 1024)), 'dropped'); // only in backup 1
    const first = await c.run();
    c.advance(DAY);
    c.ss.unref(dropped, 'dropped');
    const middle = await c.ss.add(new Uint8Array(randomBytes(96 * 1024)), 'middle');
    const second = await c.run();
    c.advance(DAY);
    await c.ss.add(new Uint8Array(randomBytes(32 * 1024)), 'last');
    const third = await c.run();
    expect(third.reusedBlobs).toBe(2);

    const repository = await c.repository();
    try {
      const plan = await planPrune({ db: c.hub.db, destination: c.destination, repository, deps: c.deps, workDir: c.workDir, policy: { daily: 1, weekly: 0, monthly: 0 } });
      expect(plan.keep).toEqual([third.backupId]);
      expect(plan.deleteManifests).toEqual([`manifests/${first.backupId}`, `manifests/${second.backupId}`]);
      expect(plan.sweepPacks.length).toBeGreaterThan(0);
      expect(plan.bytes).toBeGreaterThan(0);
      expect(plan.digest).toMatch(/^[0-9a-f]{64}$/);

      const reader = await openBackupV2(c.destination.source(), third.backupId, { repository }, c.deps);
      const referenced = await reader.referencedPacks();
      reader.close();
      for (const pack of plan.sweepPacks) expect(referenced).not.toContain(pack.slice('packs/'.length));
      // The shared blob's bytes live in backup 1's packs; they are referenced by backup 3 and therefore kept.
      const firstReader = await openBackupV2(c.destination.source(), first.backupId, { repository }, c.deps);
      const sharedPacks = new Set<string>();
      for await (const entry of firstReader.listEntries()) if (entry.kind === 'blob' && entry.sha256 === shared) for (const [pack] of entry.extents) sharedPacks.add(pack);
      firstReader.close();
      for (const pack of sharedPacks) expect(referenced).toContain(pack);

      const before = c.packs();
      const removed = await applyPrunePlan(c.destination, plan);
      expect(removed).toEqual({ manifests: 2, packs: plan.sweepPacks.length, bytes: plan.bytes });
      expect(c.packs()).toEqual(before.filter((p) => !plan.sweepPacks.includes(`packs/${p}`)));
      for (const pack of sharedPacks) expect(c.packs()).toContain(pack);

      // The retained backup still verifies end to end and every blob reads back, including the one in backup 1's packs.
      const after = await openBackupV2(c.destination.source(), third.backupId, { repository }, c.deps);
      await after.verify({ scope: 'full' });
      const blobs: string[] = [];
      for await (const entry of after.listEntries()) if (entry.kind === 'blob') { for await (const piece of after.readEntry(entry)) piece.fill(0); blobs.push(entry.sha256); }
      after.close();
      expect(blobs).toContain(shared);
      expect(blobs).toContain(middle);
      expect(blobs).not.toContain(dropped);

      // A second plan finds nothing left to do.
      const again = await planPrune({ db: c.hub.db, destination: c.destination, repository, deps: c.deps, workDir: c.workDir, policy: { daily: 1, weekly: 0, monthly: 0 } });
      expect(again).toMatchObject({ deleteManifests: [], sweepPacks: [], bytes: 0 });
    } finally {
      repository.close();
    }
  });

  it('the default policy keeps a week of daily backups; an unfinished run is never retained and its packs are swept', { timeout: 60_000 }, async () => {
    const c = await chain();
    await c.ss.add(new Uint8Array(randomBytes(16 * 1024)), 'a');
    const ids: string[] = [];
    for (let i = 0; i < 9; i += 1) {
      ids.push((await c.run()).backupId);
      c.advance(DAY);
    }
    await expect(c.run({ beforeManifest: () => { throw new SimulatedCrash(); } })).rejects.toBeInstanceOf(SimulatedCrash);
    const repository = await c.repository();
    try {
      const plan = await planPrune({ db: c.hub.db, destination: c.destination, repository, deps: c.deps, workDir: c.workDir });
      // Nine days: the newest 7 days plus the newest of older weeks and months (Oct 1 to Oct 9: one week boundary, one month).
      expect(plan.keep).toEqual(ids.slice(2));
      expect(plan.deleteManifests).toEqual(ids.slice(0, 2).map((id) => `manifests/${id}`));
      expect(plan.sweepPacks.length).toBeGreaterThan(0); // includes the unfinished run's packs
    } finally {
      repository.close();
    }
  });

  it('refuses to plan when a retained manifest cannot be read', async () => {
    const c = await chain();
    await c.ss.add(new Uint8Array(randomBytes(4 * 1024)), 'a');
    const only = await c.run();
    // Replace the only (and so retained) manifest with bytes that do not authenticate.
    const manifest = (await c.destination.list('manifests/'))[0]!.name;
    await c.destination.deleteObject(manifest);
    const out = await c.destination.sink().create(manifest);
    await out.write(new Uint8Array([0x44, 0x55, 0x44, 0x45]));
    await out.commit();
    const repository = await c.repository();
    try {
      await expect(planPrune({ db: c.hub.db, destination: c.destination, repository, deps: c.deps, workDir: c.workDir })).rejects.toBeInstanceOf(PruneError);
    } finally {
      repository.close();
    }
    expect(only.backupId).toMatch(/Z-/);
  });
});
