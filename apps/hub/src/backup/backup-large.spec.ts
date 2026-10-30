import { createHash } from 'node:crypto';
import { rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { V2_DEFAULT_CHUNK_SIZE } from '@dude/hub-backup';
import { openSqliteDatabase } from '@dude/sqlite-store';
import { createLocalBlobStore } from '../blobs/local-blob-store.js';
import { addBlobRef, recordBlob } from '../blobs/registry.js';
import { hubPaths } from '../config/data-dir.js';
import type { HubDb } from '../db/open-hub-db.js';
import { makeRepositoryFolder, openFixtureHub, openSaveSphereFixture, randomCheapDeps, seedHubDb, tempRoot } from './backup-fixture.js';
import { createBackupExportFile } from './create-export.js';
import { createLocalFolderDestination } from './destinations/local-folder.js';
import { applyRestore, previewRestore } from './restore.js';
import { runBackupV2 } from './run-backup-v2.js';

/**
 * The 32-SS1 exit run for backup scale (Milestone 854, PD-154): a generated blob store of more than 512 MiB (the v1 ceiling) goes through the REAL engine with
 * the production chunk and pack sizes, into a repository folder and into a single-file transfer export, and each is restored onto a fresh data directory under
 * the 31G rules; every blob is then re-hashed on disk. Resident memory is sampled the whole time and must stay far below the data size. It
 * complements `packages/hub-backup/src/backup-v2-scale.spec.ts` (the FORMAT at 600 MiB with deterministic counters); this one proves the ENGINE and the RESTORE
 * (snapshots, the blob lease, the dedupe index, verify-on-write, staged restore) at that size.
 *
 * Opt-in (about 2 GiB of temporary disk, a few minutes): `DUDE_TEST_BIG=1`, normally through `npm run test:hub:large`; skipped otherwise. Data is
 * a deterministic xorshift stream, never a fixture file, and is never held in memory: a blob is written to the store one 1 MiB piece at a time.
 */
const BIG = process.env['DUDE_TEST_BIG'] === '1';
const MIB = 1024 * 1024;
const PASSPHRASE = 'large backup spec passphrase';
const MASTER = new Uint8Array(32).fill(7);
const NEW_ID = 'restored-large-hub';
/** One blob is larger than a pack (it spans several), the rest are ordinary attachment sizes; the total clears the v1 ceiling of 512 MiB. */
const BLOB_SIZES = [200 * MIB, ...Array.from({ length: 24 }, () => 16 * MIB), 7 * MIB + 12_345];
const TOTAL = BLOB_SIZES.reduce((sum, size) => sum + size, 0);
/** The ceiling for resident memory above the level at the start of a phase. The data is about 590 MiB, so this is well under what holding it would take. */
const RSS_CEILING = 256 * MIB;

function* prng(size: number, seed: number): Generator<Uint8Array> {
  let x = seed >>> 0 || 1;
  for (let at = 0; at < size; at += MIB) {
    const length = Math.min(MIB, size - at);
    const words = new Uint32Array(Math.ceil(length / 4));
    for (let i = 0; i < words.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      words[i] = x >>> 0;
    }
    yield new Uint8Array(words.buffer, 0, length);
  }
}

async function* asyncPieces(size: number, seed: number): AsyncGenerator<Uint8Array> {
  for (const piece of prng(size, seed)) yield piece;
}

const report = (what: string, growth: number): void => console.info(`[backup-large] ${what}: resident memory grew by ${(growth / MIB).toFixed(0)} MiB for ${(TOTAL / MIB).toFixed(0)} MiB of blobs`);

/** Samples resident memory every 50 ms; `stop()` returns the growth over the level at `start()`. */
function trackRss(): { stop(): number } {
  const base = process.memoryUsage().rss;
  let peak = base;
  const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 50);
  return { stop: () => { clearInterval(timer); peak = Math.max(peak, process.memoryUsage().rss); return peak - base; } };
}

async function sha256OfStream(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const hash = createHash('sha256');
  for await (const piece of stream) hash.update(piece);
  return hash.digest('hex');
}

describe.skipIf(!BIG)('backup v2 at scale: more than 512 MiB through the engine and the restore', () => {
  const roots: string[] = [];
  let hub: HubDb;
  let ssClose: () => void = () => undefined;
  let paths: ReturnType<typeof hubPaths>;
  let sdb: ReturnType<typeof openSaveSphereFixture>['sdb'];
  let blobs: Array<{ sha256: string; size: number }> = [];
  let deps = randomCheapDeps();
  const now = (): number => Date.parse('2026-10-29T12:00:00Z');
  let sourceRoot = '';

  beforeAll(async () => {
    sourceRoot = tempRoot('large-source');
    roots.push(sourceRoot);
    const opened = openFixtureHub(sourceRoot);
    hub = opened.hub;
    paths = opened.paths;
    seedHubDb(hub.db);
    deps = randomCheapDeps(() => new Date(now()));
    const ss = openSaveSphereFixture(paths, now);
    ssClose = ss.close;
    sdb = ss.sdb;
    const store = createLocalBlobStore(paths);
    for (const [index, size] of BLOB_SIZES.entries()) {
      const put = await store.put(asyncPieces(size, 9000 + index));
      expect(put.size).toBe(size);
      recordBlob(sdb, { sha256: put.sha256, size: put.size, now: now(), created: put.created });
      addBlobRef(sdb, { sha256: put.sha256, ownerKind: 'attachment', ownerId: `large-${index}`, now: now() });
      blobs.push({ sha256: put.sha256, size: put.size });
    }
    expect(TOTAL).toBeGreaterThan(512 * MIB);
  }, 600_000);

  afterAll(() => {
    ssClose();
    hub?.close();
    for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  });

  /** Restores onto a fresh data directory and re-hashes every blob on disk; returns the resident-memory growth of the restore. */
  async function restoreAndVerify(source: { folder: string } | { file: string }): Promise<number> {
    const target = tempRoot('large-restored');
    roots.push(target);
    const memory = trackRss();
    const preview = await previewRestore({ ...source, passphrase: PASSPHRASE, dataRoot: target, deps, now, newToken: () => 'tok-large' });
    expect(preview.summary).toMatchObject({ formatVersion: 2, blobs: blobs.length, blobBytes: TOTAL, requiresOldHubGonePhrase: true, targetState: 'empty' });
    const result = await applyRestore({ ...source, passphrase: PASSPHRASE, dataRoot: target, confirmToken: 'tok-large', deps, now, newId: () => NEW_ID, oldHubGoneConfirmed: true });
    const growth = memory.stop();
    report('restore', growth);
    expect(result).toMatchObject({ hubInstanceId: NEW_ID, blobs: blobs.length });

    const restoredStore = createLocalBlobStore(hubPaths(target));
    for (const blob of blobs) {
      expect(await restoredStore.stat(blob.sha256), blob.sha256).toMatchObject({ size: blob.size });
      expect(await sha256OfStream(await restoredStore.open(blob.sha256)), blob.sha256).toBe(blob.sha256);
    }
    const restoredDb = openSqliteDatabase(hubPaths(target).saveSphereDbPath);
    try {
      expect((restoredDb.prepare("SELECT COUNT(*) AS n FROM blobs WHERE state = 'ok'").get() as { n: number }).n).toBe(blobs.length);
      expect((restoredDb.prepare('SELECT COUNT(*) AS n FROM blob_refs').get() as { n: number }).n).toBe(blobs.length);
    } finally { restoredDb.close(); }
    return growth;
  }

  it('a repository backup streams with bounded memory and restores every blob byte for byte', { timeout: 1_200_000 }, async () => {
    const destRoot = tempRoot('large-dest');
    roots.push(destRoot);
    await makeRepositoryFolder(destRoot, { passphrase: PASSPHRASE, deps, masterKey: MASTER });
    const destination = createLocalFolderDestination({ id: 'd-large', label: 'Large', folder: destRoot });

    const memory = trackRss();
    const run = await runBackupV2({
      db: hub.db, paths, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, destination, masterKey: MASTER, deps, now, trigger: 'manual', saveSphereDb: sdb,
      audit: () => undefined,
    });
    const writeGrowth = memory.stop();
    report('repository backup', writeGrowth);
    expect(run).toMatchObject({ blobs: blobs.length, newBlobs: blobs.length, reusedBlobs: 0, skippedBlobs: 0 });
    expect(run.backupBytes).toBeGreaterThan(TOTAL);
    expect(run.packBytesWritten).toBeGreaterThan(TOTAL); // incompressible data: the packs are at least as large as the plaintext
    expect(run.packs).toBeGreaterThan(Math.floor(TOTAL / (64 * MIB)));
    expect(V2_DEFAULT_CHUNK_SIZE).toBe(MIB);
    expect(writeGrowth, `resident memory grew by ${(writeGrowth / MIB).toFixed(0)} MiB while writing ${(TOTAL / MIB).toFixed(0)} MiB`).toBeLessThan(RSS_CEILING);

    const restoreGrowth = await restoreAndVerify({ folder: destRoot });
    expect(restoreGrowth, `resident memory grew by ${(restoreGrowth / MIB).toFixed(0)} MiB while restoring ${(TOTAL / MIB).toFixed(0)} MiB`).toBeLessThan(RSS_CEILING);
    // The second backup of unchanged content writes no blob again: the dedupe index is the previous manifest, at scale.
    const again = await runBackupV2({
      db: hub.db, paths, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, destination, masterKey: MASTER, deps, now: () => now() + 3_600_000, trigger: 'manual', saveSphereDb: sdb,
      audit: () => undefined,
    });
    expect(again).toMatchObject({ newBlobs: 0, reusedBlobs: blobs.length });
    expect(again.packBytesWritten).toBeLessThan(8 * MIB);
  });

  it('a single-file transfer export (backup create --for-transfer) streams the same data and restores it', { timeout: 1_200_000 }, async () => {
    const out = tempRoot('large-export');
    roots.push(out);
    const memory = trackRss();
    const created = await createBackupExportFile({
      db: hub.db, paths, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, forTransfer: false, targetDir: out, passphrase: PASSPHRASE, deps, now,
      workDir: path.join(paths.backupsDir, '.tmp'), saveSphereDb: sdb,
    });
    const growth = memory.stop();
    report('transfer export', growth);
    expect(created.blobs).toBe(blobs.length);
    expect(statSync(created.file).size).toBeGreaterThan(TOTAL);
    expect(growth, `resident memory grew by ${(growth / MIB).toFixed(0)} MiB while exporting ${(TOTAL / MIB).toFixed(0)} MiB`).toBeLessThan(RSS_CEILING);

    const restoreGrowth = await restoreAndVerify({ file: created.file });
    expect(restoreGrowth, `resident memory grew by ${(restoreGrowth / MIB).toFixed(0)} MiB while restoring the export`).toBeLessThan(RSS_CEILING);
  });
});
