import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, closeSync, writeSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openBackupV2 } from '@dude/hub-backup';
import type { ObjectSink } from '@dude/hub-backup';
import { getMeta, openSqliteDatabase, setMeta, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { BlobGcError, applyBlobGc, previewBlobGc } from '../blobs/blob-gc.js';
import { hubPaths } from '../config/data-dir.js';
import { loadOrCreateHubConfig } from '../config/hub-config.js';
import type { HubDb } from '../db/open-hub-db.js';
import { getAuthorityEpoch } from '../hub/authority.js';
import { readDestinationState } from '../hub/backup-destination-state.js';
import { PROVISIONING_LAST_RUN_META, deriveOverall, readLastRun } from '../provisioning/index.js';
import { appendAuditOutbox } from '../savesphere-db/audit-outbox.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { makeRepositoryFolder, openFixtureHub, openSaveSphereFixture, randomCheapDeps, seedHubDb, tempRoot } from './backup-fixture.js';
import { createBackupExportFile } from './create-export.js';
import { createLocalFolderDestination } from './destinations/local-folder.js';
import type { BackupDestination } from './destinations/destination.js';
import { applyRestore, previewRestore } from './restore.js';
import { BackupRunError, SimulatedCrash, readJournal, runBackupV2 } from './run-backup-v2.js';
import type { RunBackupV2Options } from './run-backup-v2.js';
import { SAVESPHERE_SCRUBBED_TABLES, SCRUBBED_TABLES } from './snapshot.js';

const PASSPHRASE = 'engine spec passphrase';
const NEW_ID = 'restored-hub-instance';
const MASTER = new Uint8Array(32).fill(5);
const KIB = 1024;
const MIB = 1024 * KIB;
const roots: string[] = [];
const hubs: HubDb[] = [];
const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

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
  const run = (extra: Partial<RunBackupV2Options> = {}) => runBackupV2({
    db: hub.db, paths, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, destination, masterKey: MASTER, deps, now, trigger: 'manual',
    saveSphereDb: ss.sdb, audit: (event, outcome, detail) => void events.push({ event, outcome, detail }), chunkSize: 16 * KIB, packBytes: 256 * KIB,
    ...extra,
  });
  return {
    root, hub, paths, ss, destRoot, destination, deps, run, events, now,
    advance: (ms: number) => { clock += ms; },
    objects: (sub: 'packs' | 'manifests'): string[] => (existsSync(path.join(destRoot, sub)) ? readdirSync(path.join(destRoot, sub)).filter((n) => !n.endsWith('.part')).sort() : []),
    /** The blob hashes a backup's manifest lists (opened with the passphrase, as a restore would). */
    async blobsOf(backupId: string): Promise<string[]> {
      const reader = await openBackupV2(destination.source(), backupId, { passphrase: PASSPHRASE }, deps);
      const out: string[] = [];
      try { for await (const entry of reader.listEntries()) if (entry.kind === 'blob') out.push(entry.sha256); } finally { reader.close(); }
      return out.sort();
    },
  };
}

async function restoreInto(source: { folder: string } | { file: string }, deps: ReturnType<typeof randomCheapDeps>, now: () => number) {
  const target = tempRoot('restored');
  roots.push(target);
  const preview = await previewRestore({ ...source, passphrase: PASSPHRASE, dataRoot: target, deps, now, newToken: () => 'tok-1' });
  const result = await applyRestore({ ...source, passphrase: PASSPHRASE, dataRoot: target, confirmToken: 'tok-1', deps, now, newId: () => NEW_ID, oldHubGoneConfirmed: true });
  return { target, paths: hubPaths(target), preview, result };
}

function openPlain(file: string): Db {
  const db = openSqliteDatabase(file);
  closers.push(() => { try { db.close(); } catch { /* closed */ } });
  return db;
}

const count = (db: Db, table: string): number => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);

describe('backup v2 engine: chained backups, dedupe and restore', () => {
  it('three chained backups write only new blobs; the latest restores onto a fresh data directory byte for byte under the 31G rules', { timeout: 120_000 }, async () => {
    const h = await harness('chain');
    const blobA = new Uint8Array(randomBytes(MIB));
    const blobB = new Uint8Array(randomBytes(MIB));
    const a = await h.ss.add(blobA, 'item-a');
    const b = await h.ss.add(blobB, 'item-b');
    // Transient SaveSphere state that must never travel: an outbox row and a provisioning run of this identity.
    transaction(h.ss.sdb, () => appendAuditOutbox(h.ss.sdb, { event: 'provisioning.run', dedupeKey: 'spec-outbox-row', now: h.now() }));
    setMeta(h.ss.sdb, PROVISIONING_LAST_RUN_META, JSON.stringify({ at: '2026-10-04T11:00:00.000Z', outcome: 'ok', hubInstanceId: h.hub.hubInstanceId }));

    const first = await h.run();
    expect(first).toMatchObject({ newBlobs: 2, reusedBlobs: 0, skippedBlobs: 0, files: 3 });
    expect(first.packBytesWritten).toBeGreaterThan(2 * MIB);
    expect(await h.blobsOf(first.backupId)).toEqual([a, b].sort());

    // Backup 2: C is new, A lost its last reference (dropped from the snapshot), B is unchanged (deduplicated by reference).
    h.advance(3_600_000);
    const blobC = new Uint8Array(randomBytes(MIB));
    const c = await h.ss.add(blobC, 'item-c');
    h.ss.unref(a, 'item-a');
    const second = await h.run();
    expect(second).toMatchObject({ newBlobs: 1, reusedBlobs: 1 });
    // Only C and the small databases were written: the second run's packs are about a third of the first's.
    expect(second.packBytesWritten).toBeGreaterThan(MIB);
    expect(second.packBytesWritten).toBeLessThan(MIB + 512 * KIB);
    expect(await h.blobsOf(second.backupId)).toEqual([b, c].sort());

    h.advance(3_600_000);
    const blobD = new Uint8Array(randomBytes(512 * KIB));
    const d = await h.ss.add(blobD, 'item-d');
    const third = await h.run();
    expect(third).toMatchObject({ newBlobs: 1, reusedBlobs: 2 });
    expect(third.packBytesWritten).toBeLessThan(512 * KIB + 512 * KIB);
    expect(await h.blobsOf(third.backupId)).toEqual([b, c, d].sort());
    expect(h.objects('manifests')).toHaveLength(3);
    expect(readDestinationState(h.hub.db, 'd-1')).toMatchObject({ lastOutcome: 'success', lastBackupId: third.backupId });
    expect(h.events.filter((e) => e.event === 'backup.v2-created')).toHaveLength(3);
    expect(h.events.filter((e) => e.event === 'backup.v2-verified')).toHaveLength(3);
    expect(JSON.stringify(h.events)).not.toContain(h.root);

    // Restore the newest backup (the default) from the destination folder onto an empty data directory.
    const { paths, preview, result } = await restoreInto({ folder: h.destRoot }, h.deps, h.now);
    expect(preview.summary).toMatchObject({ formatVersion: 2, backupId: third.backupId, blobs: 3, blobBytes: 2 * MIB + 512 * KIB, newEpoch: 4, forTransfer: false, requiresOldHubGonePhrase: true, targetState: 'empty' });
    expect(result).toEqual({ hubInstanceId: NEW_ID, authorityEpoch: 4, devices: 1, replacedDir: null, blobs: 3 });

    const hubDb = openPlain(paths.dbFile);
    expect(getMeta(hubDb, 'hub_instance_id')).toBe(NEW_ID);
    expect(getAuthorityEpoch(hubDb)).toBe(4);
    expect(hubDb.prepare("SELECT needs_re_pair FROM devices WHERE device_id = 'dev-1'").get()).toEqual({ needs_re_pair: 1 });
    expect(count(hubDb, 'records')).toBe(1);
    for (const table of SCRUBBED_TABLES) expect(count(hubDb, table), table).toBe(0);
    expect(hubDb.prepare("SELECT COUNT(*) AS n FROM meta WHERE key LIKE 'backup_dest%' OR key = 'backup_last'").get()).toEqual({ n: 0 });
    expect(hubDb.prepare("SELECT event FROM audit_events WHERE event LIKE 'backup.restore%' ORDER BY seq").all()).toEqual([{ event: 'backup.restore-previewed' }, { event: 'backup.restored' }]);

    const ssDb = openPlain(paths.saveSphereDbPath);
    expect((ssDb.prepare('SELECT sha256, state FROM blobs ORDER BY sha256').all() as Array<{ sha256: string; state: string }>)).toEqual([b, c, d].sort().map((sha256) => ({ sha256, state: 'ok' })));
    expect(count(ssDb, 'blob_refs')).toBe(3);
    for (const table of SAVESPHERE_SCRUBBED_TABLES) expect(count(ssDb, table), table).toBe(0);
    expect(ssDb.prepare("SELECT COUNT(*) AS n FROM meta WHERE key LIKE 'blob_lease:%'").get()).toEqual({ n: 0 });
    // The provisioning run belongs to the old identity: the restored Hub derives "needs provisioning".
    const lastRun = readLastRun(ssDb);
    expect(lastRun?.hubInstanceId).toBe(h.hub.hubInstanceId);
    expect(deriveOverall({ storeState: 'ready', lastRun, hubInstanceId: NEW_ID, components: [], secrets: [] })).toBe('needs-provisioning');

    // Every blob, byte for byte, in the content-addressed layout.
    const blobFile = (sha: string): string => path.join(paths.blobsDir, sha.slice(0, 2), sha.slice(2, 4), sha);
    expect(readFileSync(blobFile(b))).toEqual(Buffer.from(blobB));
    expect(readFileSync(blobFile(c))).toEqual(Buffer.from(blobC));
    expect(readFileSync(blobFile(d))).toEqual(Buffer.from(blobD));
    expect(existsSync(blobFile(a))).toBe(false);
    expect(existsSync(path.join(paths.dataDir, '.restore-tmp'))).toBe(false);

    // hub.json is reduced to the port and names (no proxy, schedule or destination).
    expect(loadOrCreateHubConfig(paths.configFile)).toEqual({ port: 9123, bind: 'loopback', exposure: { mode: 'private', names: ['hub.lan'] } });
  });

  it('the single-file export (backup create, transfer) carries the blobs and restores them too', { timeout: 60_000 }, async () => {
    const h = await harness('export');
    const bytes = new Uint8Array(randomBytes(300 * KIB));
    const sha = await h.ss.add(bytes, 'only');
    const created = await createBackupExportFile({
      db: h.hub.db, paths: h.paths, hubVersion: '1.2.3', hubInstanceId: h.hub.hubInstanceId, forTransfer: true, targetDir: path.join(h.root, 'out'),
      passphrase: PASSPHRASE, deps: h.deps, now: h.now, workDir: path.join(h.paths.backupsDir, '.tmp'), saveSphereDb: h.ss.sdb, chunkSize: 16 * KIB, packBytes: 128 * KIB,
    });
    expect(created).toMatchObject({ blobs: 1, head: { forTransfer: true, source: { hubInstanceId: h.hub.hubInstanceId, authorityEpoch: 3 } } });
    expect(created.files.map((f) => f.name).sort()).toEqual(['dude.db', 'hub.json', 'savesphere.db']);
    expect(readdirSync(path.join(h.paths.backupsDir, '.tmp'))).toEqual([]);
    const { paths, preview, result } = await restoreInto({ file: created.file }, h.deps, h.now);
    expect(preview.summary).toMatchObject({ formatVersion: 2, forTransfer: true, requiresOldHubGonePhrase: false, blobs: 1 });
    expect(result.blobs).toBe(1);
    expect(sha256(readFileSync(path.join(paths.blobsDir, sha.slice(0, 2), sha.slice(2, 4), sha)))).toBe(sha);
  });
});

describe('backup v2 engine: consistency, leases and failures', () => {
  it('holds the blob lease for the whole run: garbage collection is refused during it and allowed after', async () => {
    const h = await harness('lease');
    const doomed = await h.ss.add(new Uint8Array(randomBytes(4 * KIB)), null); // unreferenced from the start
    h.advance(8 * 24 * 3_600_000);
    const confirmations = new ConfirmationStore();
    const gc = { db: h.ss.sdb, store: h.ss.store, confirmations, now: h.now };
    let refused: unknown;
    await h.run({
      hooks: {
        afterSnapshots: async () => {
          const preview = previewBlobGc(gc);
          expect(preview.plan.blobs.map((x) => x.sha256)).toEqual([doomed]);
          refused = await applyBlobGc(gc, { plan: preview.plan, confirmToken: preview.confirmToken }).catch((e: unknown) => e);
        },
      },
    });
    expect(refused).toBeInstanceOf(BlobGcError);
    expect((refused as BlobGcError).code).toBe('lease-held');
    expect(await h.ss.store.has(doomed)).toBe(true);
    expect(h.ss.sdb.prepare("SELECT COUNT(*) AS n FROM meta WHERE key LIKE 'blob_lease:%'").get()).toEqual({ n: 0 });
    const after = previewBlobGc(gc);
    expect((await applyBlobGc(gc, { plan: after.plan, confirmToken: after.confirmToken })).deleted).toBe(1);
  });

  it('takes the blob set from the snapshot: a blob added after it is not in the backup, one released after it still is', async () => {
    const h = await harness('snapshot');
    const kept = await h.ss.add(new Uint8Array(randomBytes(8 * KIB)), 'kept');
    let late = '';
    const result = await h.run({
      hooks: {
        afterSnapshots: async () => {
          late = await h.ss.add(new Uint8Array(randomBytes(8 * KIB)), 'late');
          h.ss.unref(kept, 'kept');
        },
      },
    });
    expect(result.blobs).toBe(1);
    expect(await h.blobsOf(result.backupId)).toEqual([kept]);
    expect(late).toMatch(/^[0-9a-f]{64}$/);
    expect(await h.ss.store.has(late)).toBe(true);
  });

  it('a crash between the packs and the manifest leaves no manifest; the next run sweeps the orphans and succeeds', async () => {
    const h = await harness('crash');
    await h.ss.add(new Uint8Array(randomBytes(600 * KIB)), 'big');
    await expect(h.run({ hooks: { beforeManifest: () => { throw new SimulatedCrash(); } } })).rejects.toBeInstanceOf(SimulatedCrash);
    expect(h.objects('manifests')).toEqual([]);
    const orphanPacks = h.objects('packs');
    expect(orphanPacks.length).toBeGreaterThan(1);
    const journal = readJournal(h.hub.db, 'd-1');
    expect(journal?.objects.map((o) => o.slice('packs/'.length)).sort()).toEqual(orphanPacks);

    h.advance(60_000);
    const next = await h.run();
    expect(next.newBlobs).toBe(1);
    expect(h.objects('manifests')).toEqual([next.backupId]);
    for (const orphan of orphanPacks) expect(h.objects('packs')).not.toContain(orphan);
    expect(readJournal(h.hub.db, 'd-1')).toBeNull();
    const reader = await openBackupV2(h.destination.source(), next.backupId, { passphrase: PASSPHRASE }, h.deps);
    await reader.verify({ scope: 'full' });
    reader.close();
  });

  it('a pack corrupted after it was written fails verify-on-write: the run is not recorded and its objects are cleaned', async () => {
    const h = await harness('verify');
    await h.ss.add(new Uint8Array(randomBytes(300 * KIB)), 'x');
    const before = await h.run();
    h.advance(3_600_000);
    await h.ss.add(new Uint8Array(randomBytes(300 * KIB)), 'y');
    const error = await h.run({
      hooks: {
        afterManifest: () => {
          const journal = readJournal(h.hub.db, 'd-1')!;
          const pack = journal.objects.find((o) => o.startsWith('packs/'))!;
          const file = path.join(h.destRoot, ...pack.split('/'));
          const fd = openSync(file, 'r+');
          try { writeSync(fd, Buffer.from([0xff, 0x00, 0xff]), 0, 3, Math.floor(statSync(file).size / 2)); } finally { closeSync(fd); }
        },
      },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackupRunError);
    expect((error as BackupRunError).code).toBe('verification-failed');
    expect(h.objects('manifests')).toEqual([before.backupId]);
    expect(readJournal(h.hub.db, 'd-1')).toBeNull();
    expect(readDestinationState(h.hub.db, 'd-1')).toMatchObject({ lastOutcome: 'failure', lastError: 'verification-failed', lastBackupId: before.backupId });
    expect(h.events.at(-1)).toEqual({ event: 'backup.v2-failed', outcome: 'failure', detail: { destination: 'd-1', reason: 'verification-failed', trigger: 'manual' } });
    expect(h.events.filter((e) => e.event === 'backup.v2-created')).toHaveLength(1);
  });

  it('refuses a destination another operation holds, a missing repository and a foreign key, recording only real failures', async () => {
    const h = await harness('refusals');
    const { tryLockDestination, destinationLockKey } = await import('./destination-lock.js');
    const lock = tryLockDestination(destinationLockKey(h.paths.root, 'd-1'), 'prune');
    if (!('release' in lock)) throw new Error('lock expected');
    await expect(h.run()).rejects.toMatchObject({ code: 'busy' });
    expect(readDestinationState(h.hub.db, 'd-1')).toEqual({});
    lock.release();

    const empty = tempRoot('norepo');
    roots.push(empty);
    await expect(h.run({ destination: createLocalFolderDestination({ id: 'd-2', label: 'x', folder: empty }) })).rejects.toMatchObject({ code: 'repository-missing' });
    await expect(h.run({ masterKey: new Uint8Array(32).fill(6) })).rejects.toMatchObject({ code: 'repository-key-mismatch' });
    expect(readDestinationState(h.hub.db, 'd-1')).toMatchObject({ lastOutcome: 'failure', lastError: 'repository-key-mismatch' });
    expect(h.objects('manifests')).toEqual([]);
  });

  it('skips a catalogued blob whose bytes are gone; the restore marks it missing instead of inventing it', async () => {
    const h = await harness('missing');
    const present = await h.ss.add(new Uint8Array(randomBytes(4 * KIB)), 'present');
    const gone = await h.ss.add(new Uint8Array(randomBytes(4 * KIB)), 'gone');
    await h.ss.store.delete(gone);
    const result = await h.run();
    expect(result).toMatchObject({ blobs: 1, skippedBlobs: 1 });
    const { paths } = await restoreInto({ folder: h.destRoot }, h.deps, h.now);
    const ssDb = openPlain(paths.saveSphereDbPath);
    expect(ssDb.prepare('SELECT sha256, state FROM blobs ORDER BY state').all()).toEqual(
      [{ sha256: gone, state: 'missing' }, { sha256: present, state: 'ok' }].sort((x, y) => (x.state < y.state ? -1 : 1)),
    );
  });
});

describe('backup v2 engine: bounded memory', () => {
  it('streams a 100 MiB blob through the writer with a few chunks in flight, never the blob', { timeout: 180_000 }, async () => {
    const h = await harness('memory');
    const SIZE = 100 * MIB;
    const PIECE = MIB;
    /** A deterministic generator: the same bytes on every pass, never held whole. */
    const piece = (index: number): Uint8Array => {
      const out = new Uint8Array(PIECE);
      let x = (index + 1) * 2654435761;
      for (let i = 0; i < PIECE; i += 4) { x = (x * 1103515245 + 12345) >>> 0; out[i] = x & 255; out[i + 1] = (x >>> 8) & 255; out[i + 2] = (x >>> 16) & 255; out[i + 3] = x >>> 24; }
      return out;
    };
    const hasher = createHash('sha256');
    for (let i = 0; i < SIZE / PIECE; i += 1) hasher.update(piece(i));
    const sha = hasher.digest('hex');
    h.ss.sdb.prepare("INSERT INTO blobs(sha256, size, created_at, verified_at, state, unreferenced_since) VALUES(?, ?, ?, NULL, 'ok', NULL)").run(sha, SIZE, '2026-10-04T12:00:00.000Z');
    h.ss.sdb.prepare('INSERT INTO blob_refs(blob_sha256, owner_kind, owner_id, created_at) VALUES(?, ?, ?, ?)').run(sha, 'attachment', 'huge', '2026-10-04T12:00:00.000Z');

    let pulled = 0;
    let sinkBytes = 0;
    let sinkAtStart = -1;
    let maxInFlight = 0;
    const blobStore = {
      open: async () => (async function* () {
        sinkAtStart = sinkBytes;
        for (let i = 0; i < SIZE / PIECE; i += 1) {
          const next = piece(i);
          pulled += next.length;
          maxInFlight = Math.max(maxInFlight, pulled - (sinkBytes - sinkAtStart));
          yield next;
        }
      })() as never,
    };
    const inner = h.destination.sink();
    const countingSink: ObjectSink = {
      async create(name) {
        const out = await inner.create(name);
        return { write: async (bytes) => { await out.write(bytes); sinkBytes += bytes.length; }, commit: () => out.commit(), abort: () => out.abort() };
      },
    };
    const destination: BackupDestination = { ...h.destination, sink: () => countingSink };
    const heapBefore = process.memoryUsage().heapUsed;
    const result = await h.run({ destination, blobStore, chunkSize: MIB, packBytes: 64 * MIB });
    expect(result).toMatchObject({ newBlobs: 1, blobs: 1 });
    expect(pulled).toBe(SIZE);
    // Pulled-but-not-yet-written never exceeds the writer's open chunk plus the piece being taken (ciphertext only overstates progress).
    expect(maxInFlight).toBeLessThanOrEqual(2 * MIB + 64 * KIB);
    expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(64 * MIB);
    expect(result.packBytesWritten).toBeGreaterThan(SIZE);
  });
});
