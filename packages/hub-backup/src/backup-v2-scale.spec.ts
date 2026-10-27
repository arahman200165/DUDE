import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, open, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { sha256 } from '@noble/hashes/sha2.js';
import { afterAll, describe, expect, it } from 'vitest';
import { toHex } from './backup-format.js';
import {
  BackupError,
  V2_DEFAULT_CHUNK_SIZE,
  createBackupWriter,
  openBackupFile,
  openBackupV2,
  writeBackupExport,
  type BackupDeps,
  type ByteSource,
  type KdfParams,
  type ObjectSink,
  type ObjectSource,
} from './index.js';

/**
 * Generated-scale spec for the streaming v2 format. The default run streams 64 MiB; `DUDE_TEST_BIG=1`
 * (`npm run test:backup-scale`, part of the 32-SS1 exit suite) streams about 600 MiB, above the v1 512 MiB
 * ceiling. Data comes from a deterministic PRNG and is never materialized; objects live in a temp directory.
 *
 * Bounded memory is asserted deterministically: the writer never holds more than a few chunks of input that the
 * sink has not received, and an entry read never pulls more than a few chunks (plus one source piece per stream
 * it opens) beyond what it delivered. The verify pass, which delivers nothing, is checked by sampled heap growth.
 */
const MIB = 1024 * 1024;
const BIG = process.env['DUDE_TEST_BIG'] === '1';
const TOTAL = BIG ? 600 * MIB : 64 * MIB;
const PIECE = 64 * 1024;
const CHUNK = V2_DEFAULT_CHUNK_SIZE;
const PACK_BYTES = 32 * MIB;
const PASSPHRASE = 'scale passphrase';

function deps(): BackupDeps {
  let counter = 0;
  return {
    deriveKey: async (passphrase: Uint8Array, salt: Uint8Array, params: KdfParams) => sha256(new Uint8Array([...salt, ...passphrase, params.t])),
    randomBytes: (n: number) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i += 32) out.set(sha256(new Uint8Array([9, counter >>> 16, (counter >>> 8) & 255, counter++ & 255])).subarray(0, Math.min(32, n - i)), i);
      return out;
    },
    now: () => new Date('2026-10-27T12:00:00Z'),
  };
}

/** A deterministic byte stream: xorshift32 words, in `PIECE` slices. */
function* prng(size: number, seed: number): Generator<Uint8Array> {
  let x = seed >>> 0 || 1;
  for (let at = 0; at < size; at += PIECE) {
    const length = Math.min(PIECE, size - at);
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

function blobPlan(total: number): Array<{ size: number; seed: number }> {
  const plan: Array<{ size: number; seed: number }> = [{ size: Math.floor(total / 3), seed: 1000 }];
  let left = total - plan[0].size;
  let x = 12345;
  while (left > 0) {
    x = (x * 1103515245 + 12345) >>> 0;
    const size = Math.min(left, 1024 + (x % (1536 * 1024)));
    plan.push({ size, seed: 2000 + plan.length });
    left -= size;
  }
  return plan;
}

const FILES = [
  { name: 'dude.db', size: Math.floor(TOTAL * 0.55), seed: 11 },
  { name: 'savesphere.db', size: Math.floor(TOTAL * 0.15), seed: 12 },
];
const BLOBS = blobPlan(TOTAL - FILES[0].size - FILES[1].size);

const roots: string[] = [];
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

interface Meter {
  /** Bytes handed out by the source / generator. */
  pulled: number;
  /** Bytes the library finished with (written to the sink, or delivered to the consumer). */
  done: number;
  opens: number;
  peak: number;
}

function sample(meter: Meter): void {
  meter.peak = Math.max(meter.peak, meter.pulled - meter.done);
}

function diskStore(root: string, meter: Meter): { sink: ObjectSink; source: ObjectSource; size(name: string): Promise<number> } {
  const writing = new Set<string>();
  const sink: ObjectSink = {
    async create(name: string) {
      const target = join(root, name);
      if (existsSync(target) || writing.has(name)) throw new BackupError('bad-input', 'A backup object with that name already exists.');
      writing.add(name);
      await mkdir(dirname(target), { recursive: true });
      const handle = await open(`${target}.part`, 'wx');
      let closed = false;
      return {
        async write(bytes: Uint8Array) {
          await handle.write(bytes);
          meter.done += bytes.length;
          sample(meter);
        },
        async commit() {
          closed = true;
          await handle.close();
          await rename(`${target}.part`, target);
          writing.delete(name);
        },
        async abort() {
          if (!closed) await handle.close();
          closed = true;
          await rm(`${target}.part`, { force: true });
          writing.delete(name);
        },
      };
    },
  };
  const source: ObjectSource = {
    read(name: string, start = 0) {
      meter.opens++;
      return (async function* () {
        const handle = await open(join(root, name), 'r');
        try {
          for (let position = start; ; ) {
            const buffer = new Uint8Array(PIECE);
            const { bytesRead } = await handle.read(buffer, 0, PIECE, position);
            if (bytesRead === 0) return;
            position += bytesRead;
            meter.pulled += bytesRead;
            sample(meter);
            yield buffer.subarray(0, bytesRead);
          }
        } finally {
          await handle.close();
        }
      })();
    },
  };
  return {
    sink,
    source,
    async size(name: string) {
      const handle = await open(join(root, name), 'r');
      try {
        return (await handle.stat()).size;
      } finally {
        await handle.close();
      }
    },
  };
}

/** Compares a stream to a regenerated one piece by piece, counting delivered bytes into `meter`. */
async function expectStreamEquals(actual: AsyncIterable<Uint8Array>, expected: Iterable<Uint8Array>, meter: Meter): Promise<number> {
  const want = expected[Symbol.iterator]();
  let pending = new Uint8Array(0);
  let total = 0;
  for await (const piece of actual) {
    meter.done += piece.length;
    sample(meter);
    for (let at = 0; at < piece.length; ) {
      if (pending.length === 0) {
        const next = want.next();
        if (next.done) throw new Error('stream longer than expected');
        pending = next.value;
      }
      const take = Math.min(pending.length, piece.length - at);
      if (Buffer.compare(Buffer.from(piece.buffer, piece.byteOffset + at, take), Buffer.from(pending.buffer, pending.byteOffset, take)) !== 0) throw new Error(`mismatch at ${total + at}`);
      pending = pending.subarray(take);
      at += take;
    }
    total += piece.length;
  }
  if (pending.length !== 0 || !want.next().done) throw new Error('stream shorter than expected');
  return total;
}

function heapNow(): number {
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.arrayBuffers;
}

describe(`backup v2 at generated scale (${TOTAL / MIB} MiB)`, () => {
  it('writes, verifies, reads back and exports with bounded in-flight bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dude-backup-v2-scale-'));
    roots.push(root);
    const writeMeter: Meter = { pulled: 0, done: 0, opens: 0, peak: 0 };
    const store = diskStore(root, writeMeter);
    const writer = await createBackupWriter({
      passphrase: PASSPHRASE,
      sink: store.sink,
      deps: deps(),
      metadata: { hubVersion: 'scale', source: { hubInstanceId: 'scale-hub', authorityEpoch: 1, schemaVersion: 1, dbMinReaderVersion: 1 }, forTransfer: false },
      packBytes: PACK_BYTES,
    });
    const metered = function* (stream: Iterable<Uint8Array>): Generator<Uint8Array> {
      for (const piece of stream) {
        writeMeter.pulled += piece.length;
        sample(writeMeter);
        yield piece;
      }
    };
    for (const file of FILES) await writer.addFile(file.name, metered(prng(file.size, file.seed)));
    const blobIds: string[] = [];
    for (const blob of BLOBS) {
      let hash = sha256.create();
      for (const piece of prng(blob.size, blob.seed)) hash = hash.update(piece);
      blobIds.push((await writer.addBlob(metered(prng(blob.size, blob.seed)), { sha256: toHex(hash.digest()), size: blob.size })).id);
    }
    const result = await writer.finish();
    expect(result.bytes).toBe(TOTAL);
    expect(result.packIds.length).toBeGreaterThanOrEqual(Math.floor(TOTAL / PACK_BYTES));
    // The writer holds at most one chunk per open object plus one input piece.
    expect(writeMeter.peak).toBeLessThan(2 * CHUNK + 2 * PIECE);

    const readMeter: Meter = { pulled: 0, done: 0, opens: 0, peak: 0 };
    const readStore = diskStore(root, readMeter);
    const reader = await openBackupV2(readStore.source, result.backupId, { passphrase: PASSPHRASE }, deps());

    const heapBefore = heapNow();
    let heapPeak = heapBefore;
    const heapTimer = setInterval(() => (heapPeak = Math.max(heapPeak, heapNow())), 25);
    const report = await reader.verify();
    clearInterval(heapTimer);
    expect(report).toMatchObject({ files: 2, blobs: BLOBS.length, bytes: TOTAL });
    expect(heapPeak - heapBefore).toBeLessThan(BIG ? 200 * MIB : TOTAL + 64 * MIB);

    for (const file of FILES) {
      const meter: Meter = { pulled: 0, done: 0, opens: 0, peak: 0 };
      const entryReader = await openBackupV2(diskStore(root, meter).source, result.backupId, { passphrase: PASSPHRASE }, deps());
      meter.pulled = 0;
      meter.opens = 0;
      expect(await expectStreamEquals(entryReader.readEntry(file.name), prng(file.size, file.seed), meter)).toBe(file.size);
      // One authenticated chunk (cached plaintext plus its frame) and one source piece per stream it opened.
      expect(meter.peak, file.name).toBeLessThan(3 * CHUNK + meter.opens * PIECE);
      entryReader.close();
    }
    for (const index of [0, 1, 2, BLOBS.length - 1]) {
      const meter: Meter = { pulled: 0, done: 0, opens: 0, peak: 0 };
      const blobReader = await openBackupV2(diskStore(root, meter).source, result.backupId, { passphrase: PASSPHRASE }, deps());
      meter.pulled = 0;
      meter.opens = 0;
      const blob = BLOBS[index];
      expect(await expectStreamEquals(blobReader.readBlob(blobIds[index]), prng(blob.size, blob.seed), meter)).toBe(blob.size);
      expect(meter.peak).toBeLessThan(3 * CHUNK + meter.opens * PIECE);
      blobReader.close();
    }

    // The single-file export streams object bytes through without decrypting or buffering them.
    const exportMeter: Meter = { pulled: 0, done: 0, opens: 0, peak: 0 };
    const exportStore = diskStore(root, exportMeter);
    const exportReader = await openBackupV2(exportStore.source, result.backupId, { passphrase: PASSPHRASE }, deps());
    const out = await exportStore.sink.create('export.dudebackup');
    const exported = await writeBackupExport(exportReader, out);
    await out.commit();
    exportReader.close();
    // It decrypts only the manifest (to list the referenced packs); pack bytes pass straight through.
    expect(exportMeter.peak).toBeLessThan((await exportStore.size(result.manifestName)) * 2 + 2 * PIECE);
    const exportPath = join(root, 'export.dudebackup');
    const size = await exportStore.size('export.dudebackup');
    expect(size).toBe(exported.bytes);
    const file: ByteSource = {
      size,
      read(start: number, end: number) {
        return (async function* () {
          const handle = await open(exportPath, 'r');
          try {
            for (let position = start; position < end; ) {
              const buffer = new Uint8Array(Math.min(PIECE, end - position));
              const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
              if (bytesRead === 0) return;
              position += bytesRead;
              yield buffer.subarray(0, bytesRead);
            }
          } finally {
            await handle.close();
          }
        })();
      },
    };
    const opened = await openBackupFile(file, { passphrase: PASSPHRASE }, deps());
    if (opened.formatVersion !== 2) throw new Error('expected a v2 export');
    expect((await opened.reader.verify({ scope: 'new' })).bytes).toBe(TOTAL);
    opened.reader.close();
    reader.close();
    if (BIG) console.info(`backup v2 scale: ${TOTAL / MIB} MiB, ${result.packIds.length} packs, writer in-flight peak ${(writeMeter.peak / MIB).toFixed(2)} MiB, verify heap growth ${((heapPeak - heapBefore) / MIB).toFixed(1)} MiB`);
  }, BIG ? 900_000 : 120_000);
});
