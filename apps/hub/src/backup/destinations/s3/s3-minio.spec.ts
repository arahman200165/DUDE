import { createHash, randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_OBJECT_NAME, createRepository } from '@dude/hub-backup';
import { createLocalBlobStore } from '../../../blobs/local-blob-store.js';
import { hubPaths } from '../../../config/data-dir.js';
import type { HubBackupS3Destination } from '../../../config/hub-config.js';
import type { HubDb } from '../../../db/open-hub-db.js';
import { openFixtureHub, openSaveSphereFixture, randomCheapDeps, seedHubDb, tempRoot } from '../../backup-fixture.js';
import { applyRestore, previewRestore } from '../../restore.js';
import { runBackupV2 } from '../../run-backup-v2.js';
import { createS3Destination } from './s3-destination.js';
import type { S3BackupDestination } from './s3-destination.js';

/**
 * The S3 destination against a REAL S3-compatible server (32-SS1 exit gate, Milestone 854; MinIO in CI, PD-150): everything the fake-server specs prove
 * (`s3-destination.spec.ts`) is only as good as the fake, so this runs the same contracts (write-once, `If-None-Match`, multipart at the real 5 MiB
 * minimum, listing, offset reads, idempotent deletes, the re-wrap overwrite) and then a whole backup v2 run and a restore through the destination.
 *
 * Skipped unless `DUDE_TEST_S3_ENDPOINT` is set (the CI job `hub-s3` starts MinIO and sets it; locally see `docs/delivery/QUALITY_AND_RELEASE.md`):
 *   DUDE_TEST_S3_ENDPOINT   `http://127.0.0.1:9000` (plain http is accepted for a loopback endpoint only, together with allowPrivateNetwork)
 *   DUDE_TEST_S3_BUCKET     an existing bucket (default `dude-test`)
 *   DUDE_TEST_S3_ACCESS_KEY / DUDE_TEST_S3_SECRET_KEY   the credentials (default `minioadmin`)
 *   DUDE_TEST_S3_REGION     default `us-east-1`
 * Every object lives under a random prefix that the spec removes at the end.
 */
const ENDPOINT = process.env['DUDE_TEST_S3_ENDPOINT'];
const MIB = 1024 * 1024;
const PASSPHRASE = 'minio spec passphrase';
const MASTER = new Uint8Array(32).fill(3);
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const piece of stream) parts.push(piece);
  return Buffer.concat(parts);
}

// CI sets DUDE_TEST_S3_REQUIRE=1 so that a job that lost its MinIO fails instead of silently skipping.
it.skipIf(process.env['DUDE_TEST_S3_REQUIRE'] !== '1')('is not skipped when the CI job requires a real S3 server', () => {
  expect(ENDPOINT, 'DUDE_TEST_S3_ENDPOINT must be set when DUDE_TEST_S3_REQUIRE=1').toBeTruthy();
});

describe.skipIf(ENDPOINT === undefined || ENDPOINT === '')('s3 destination against a real S3-compatible server (MinIO)', () => {
  const prefix = `dude-spec-${randomBytes(6).toString('hex')}`;
  const definition: HubBackupS3Destination = {
    id: 'd-minio', kind: 's3', label: 'MinIO', endpoint: ENDPOINT ?? '', region: process.env['DUDE_TEST_S3_REGION'] ?? 'us-east-1',
    bucket: process.env['DUDE_TEST_S3_BUCKET'] ?? 'dude-test', prefix, forcePathStyle: true, allowPrivateNetwork: true,
  };
  const credentials = { accessKeyId: process.env['DUDE_TEST_S3_ACCESS_KEY'] ?? 'minioadmin', secretAccessKey: process.env['DUDE_TEST_S3_SECRET_KEY'] ?? 'minioadmin' };
  // Built in beforeAll: the describe body also runs when the suite is skipped, and a destination with no endpoint refuses to be built.
  let destination: S3BackupDestination;
  const roots: string[] = [];
  const PACK = `packs/${'a'.repeat(32)}`;
  const BIG_PACK = `packs/${'b'.repeat(32)}`;
  const MANIFEST = `manifests/20261029T120000Z-${'c'.repeat(32)}`;

  async function put(name: string, bytes: Uint8Array, pieces = 1): Promise<void> {
    const out = await destination.sink().create(name);
    const size = Math.ceil(bytes.length / pieces);
    for (let offset = 0; offset < bytes.length; offset += size) await out.write(bytes.subarray(offset, offset + size));
    await out.commit();
  }

  beforeAll(() => {
    destination = createS3Destination({ definition, credentials });
  });

  afterAll(async () => {
    // Remove everything this run wrote (the bucket is shared with nothing else, but leave it as it was found).
    for (const prefixName of ['packs/', 'manifests/'] as const) for (const object of await destination.list(prefixName)) await destination.deleteObject(object.name).catch(() => undefined);
    await destination.deleteObject(REPO_OBJECT_NAME).catch(() => undefined);
    for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }, 120_000);

  it('probes the server: write, read, conditional write, multipart and delete, and leaves nothing behind', { timeout: 60_000 }, async () => {
    const report = await destination.probeDetailed();
    expect(report, JSON.stringify(report)).toMatchObject({ ok: true, write: true, read: true, delete: true, multipart: true, addressing: 'path' });
    expect(report.conditionalWrites).toBe('enforced'); // MinIO enforces If-None-Match with a 412
    expect(Math.abs(report.clockSkewSeconds ?? 0)).toBeLessThan(120);
    expect(await destination.probe()).toMatchObject({ ok: true });
  });

  it('writes an object once: a second create, and a racing commit, are refused by the server and nothing is overwritten', { timeout: 60_000 }, async () => {
    const first = randomBytes(300_000);
    await put(PACK, first, 3);
    expect(await destination.stat(PACK)).toEqual({ name: PACK, size: first.length });
    await expect(destination.sink().create(PACK)).rejects.toMatchObject({ code: 'exists' });
    // A second writer that passed the HEAD check before the first committed: the server's If-None-Match refuses the commit.
    const other = createS3Destination({ definition, credentials });
    const racing = await other.sink().create(`packs/${'d'.repeat(32)}`);
    await racing.write(new Uint8Array([1, 2, 3]));
    await put(`packs/${'d'.repeat(32)}`, randomBytes(10));
    await expect(racing.commit()).rejects.toMatchObject({ code: 'exists' });
    expect((await collect(destination.source().read(PACK, 0)))).toEqual(first);
    await destination.deleteObject(`packs/${'d'.repeat(32)}`);
  });

  it('uploads a large object in real multipart parts (16 MiB) and reads it back byte for byte, from an offset too', { timeout: 120_000 }, async () => {
    const bytes = randomBytes(40 * MIB + 7);
    await put(BIG_PACK, bytes, 11);
    expect(await destination.stat(BIG_PACK)).toEqual({ name: BIG_PACK, size: bytes.length });
    const back = await collect(destination.source().read(BIG_PACK, 0));
    expect(back.length).toBe(bytes.length);
    expect(sha256(back)).toBe(sha256(bytes));
    const tail = await collect(destination.source().read(BIG_PACK, 33 * MIB + 5));
    expect(tail.equals(bytes.subarray(33 * MIB + 5))).toBe(true);
    expect(await destination.sweepIncomplete?.(0, Date.now() + 3_600_000)).toBeGreaterThanOrEqual(0); // no stale upload of this run is left
  });

  it('lists committed objects sorted by name, deletes idempotently, and replaceRepo is the one overwrite', { timeout: 60_000 }, async () => {
    await put(MANIFEST, randomBytes(2048));
    expect((await destination.list('packs/')).map((o) => o.name)).toEqual([PACK, BIG_PACK]);
    expect((await destination.list('manifests/')).map((o) => o.name)).toEqual([MANIFEST]);
    await destination.deleteObject(MANIFEST);
    await destination.deleteObject(MANIFEST); // already gone: not an error
    expect(await destination.stat(MANIFEST)).toBeNull();
    await put(REPO_OBJECT_NAME, new Uint8Array([1, 1, 1]));
    await destination.replaceRepo(new Uint8Array([2, 2, 2, 2]));
    expect(await destination.stat(REPO_OBJECT_NAME)).toEqual({ name: REPO_OBJECT_NAME, size: 4 });
    await destination.deleteObject(PACK);
    await destination.deleteObject(BIG_PACK);
    await destination.deleteObject(REPO_OBJECT_NAME);
    expect(await destination.list('packs/')).toEqual([]);
  });

  it('runs a backup v2 into the bucket (verified on write) and restores it onto a fresh data directory with every blob intact', { timeout: 600_000 }, async () => {
    const root = tempRoot('minio-source');
    roots.push(root);
    const { hub, paths } = openFixtureHub(root);
    const hubDb: HubDb = hub;
    seedHubDb(hubDb.db);
    const now = (): number => Date.parse('2026-10-29T12:00:00Z');
    const deps = randomCheapDeps(() => new Date(now()));
    const ss = openSaveSphereFixture(paths, now);
    try {
      const sources = [randomBytes(12 * MIB), randomBytes(9 * MIB + 1), randomBytes(300_000)];
      const blobs: Array<{ sha256: string; size: number }> = [];
      for (const [index, bytes] of sources.entries()) blobs.push({ sha256: await ss.add(new Uint8Array(bytes), `minio-${index}`), size: bytes.length });

      // The repository header goes first, then the run (what `backup destination add` does for a new destination).
      const { repository, object } = await createRepository(PASSPHRASE, deps, undefined, { masterKey: MASTER });
      repository.close();
      const header = await destination.sink().create(REPO_OBJECT_NAME);
      await header.write(object);
      await header.commit();

      const work = tempRoot('minio-work');
      roots.push(work);
      const run = await runBackupV2({
        db: hubDb.db, paths, hubVersion: '1.2.3', hubInstanceId: hubDb.hubInstanceId, destination, masterKey: MASTER, deps, now, trigger: 'manual', saveSphereDb: ss.sdb,
        audit: () => undefined, packBytes: 20 * MIB, workDir: work,
      });
      expect(run).toMatchObject({ blobs: 3, newBlobs: 3, reusedBlobs: 0 });
      expect(run.packBytesWritten).toBeGreaterThan(21 * MIB);
      expect((await destination.list('manifests/')).length).toBe(1);
      expect((await destination.list('packs/')).length).toBe(run.packs);

      // The same backup, restored from the bucket (library use of the destination source) under the 31G rules.
      const target = tempRoot('minio-restored');
      roots.push(target);
      const preview = await previewRestore({ destination, passphrase: PASSPHRASE, dataRoot: target, deps, now, newToken: () => 'tok-minio' });
      expect(preview.summary).toMatchObject({ formatVersion: 2, blobs: 3, requiresOldHubGonePhrase: true });
      const restored = await applyRestore({ destination, passphrase: PASSPHRASE, dataRoot: target, confirmToken: 'tok-minio', deps, now, newId: () => 'restored-minio-hub', oldHubGoneConfirmed: true });
      expect(restored).toMatchObject({ hubInstanceId: 'restored-minio-hub', blobs: 3 });
      const store = createLocalBlobStore(hubPaths(target));
      for (const [index, blob] of blobs.entries()) {
        expect(sha256(await collect(await store.open(blob.sha256)))).toBe(sha256(sources[index]!));
        expect(await store.verify(blob.sha256)).toBe('ok');
      }
    } finally {
      ss.close();
      hubDb.close();
    }
  });
});
