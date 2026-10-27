import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, mkdir, open, readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { HubPaths } from '../config/data-dir.js';
import { BlobHashMismatchError, BlobNotFoundError, BlobTooLargeError, InvalidBlobRangeError, assertBlobHash } from './blob-store.js';
import type { BlobPutOptions, BlobPutResult, BlobRange, BlobSource, BlobStat, BlobStore, BlobVerifyResult } from './blob-store.js';

export type LocalBlobStorePaths = Pick<HubPaths, 'blobsDir' | 'stagingDir'>;

/**
 * Seams for crash-injection specs. They run after the staged file is complete and flushed and BEFORE (or just after) it is
 * linked into place, which are exactly the points where a killed process leaves a particular on-disk state. A throw from a hook
 * deliberately leaves the staging file behind, as a crash would; `sweepStaging` is what removes it.
 */
export interface LocalBlobStoreHooks {
  beforeCommit?(): void | Promise<void>;
  afterCommit?(): void | Promise<void>;
}

export type LocalBlobStore = BlobStore & {
  /** Removes `*.part` files older than `maxAgeMs` (leftovers of a crashed `put`); returns how many it removed. */
  sweepStaging(maxAgeMs: number, now?: number): Promise<number>;
};

const STAGING_SUFFIX = '.part';
const READ_CHUNK = 1024 * 1024;

const isCode = (error: unknown, ...codes: string[]): boolean => codes.includes((error as NodeJS.ErrnoException | undefined)?.code ?? '');

async function* chunksOf(body: BlobSource): AsyncGenerator<Uint8Array> {
  if (body instanceof Uint8Array) yield body;
  else yield* body;
}

/** Best effort: make a link durable. Opening a directory is not possible on Windows, where this is skipped. */
async function syncDirectory(dir: string): Promise<void> {
  try {
    const handle = await open(dir, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  } catch { /* unsupported on this platform or filesystem */ }
}

/**
 * Local-disk `BlobStore`: `storage/blobs/<aa>/<bb>/<sha256>`, written through `storage/staging/<random>.part` on the same volume.
 * `put` streams to the staging file while hashing, fsyncs it, then hard-links it to its final name and unlinks the staging name:
 * the link fails (`EEXIST`) instead of overwriting, so an existing blob is a dedupe hit, and the final path only ever names a
 * complete, flushed file. Directories are created lazily.
 */
export function createLocalBlobStore(paths: LocalBlobStorePaths, hooks: LocalBlobStoreHooks = {}): LocalBlobStore {
  const blobPath = (sha256: string): string => {
    assertBlobHash(sha256);
    return path.join(paths.blobsDir, sha256.slice(0, 2), sha256.slice(2, 4), sha256);
  };

  const statOrNull = async (file: string): Promise<{ size: number; mtimeMs: number } | null> => {
    try {
      const info = await stat(file);
      return info.isFile() ? { size: info.size, mtimeMs: info.mtimeMs } : null;
    } catch (error) {
      if (isCode(error, 'ENOENT', 'ENOTDIR')) return null;
      throw error;
    }
  };

  /** Streams the body into a new staging file; returns its path, hash and size. Cleans up after a failure of its own. */
  async function stage(body: BlobSource, options: BlobPutOptions): Promise<{ file: string; sha256: string; size: number }> {
    await mkdir(paths.stagingDir, { recursive: true });
    const file = path.join(paths.stagingDir, `${randomBytes(16).toString('hex')}${STAGING_SUFFIX}`);
    const handle = await open(file, 'wx');
    const hash = createHash('sha256');
    let size = 0;
    try {
      for await (const chunk of chunksOf(body)) {
        size += chunk.byteLength;
        if (options.maxBytes !== undefined && size > options.maxBytes) throw new BlobTooLargeError();
        hash.update(chunk);
        let written = 0;
        while (written < chunk.byteLength) {
          const { bytesWritten } = await handle.write(chunk, written, chunk.byteLength - written);
          written += bytesWritten;
        }
      }
      await handle.sync();
      await handle.close();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(file).catch(() => undefined);
      throw error;
    }
    const sha256 = hash.digest('hex');
    if (options.expectedSha256 !== undefined && options.expectedSha256 !== sha256) {
      await unlink(file).catch(() => undefined);
      throw new BlobHashMismatchError();
    }
    return { file, sha256, size };
  }

  async function put(body: BlobSource, options: BlobPutOptions = {}): Promise<BlobPutResult> {
    if (options.expectedSha256 !== undefined) assertBlobHash(options.expectedSha256);
    const staged = await stage(body, options);
    await hooks.beforeCommit?.();
    const target = blobPath(staged.sha256);
    await mkdir(path.dirname(target), { recursive: true });
    let created = true;
    try {
      await link(staged.file, target);
    } catch (error) {
      if (isCode(error, 'EEXIST')) {
        created = false;
      } else if (isCode(error, 'EPERM', 'ENOTSUP', 'EXDEV', 'EMLINK', 'ENOSYS')) {
        // A filesystem without hard links: check-then-rename (only this process writes the store).
        if (await statOrNull(target)) created = false;
        else await rename(staged.file, target);
      } else {
        await unlink(staged.file).catch(() => undefined);
        throw error;
      }
    }
    await unlink(staged.file).catch((error: unknown) => { if (!isCode(error, 'ENOENT')) throw error; });
    if (created) await syncDirectory(path.dirname(target));
    await hooks.afterCommit?.();
    return { sha256: staged.sha256, size: staged.size, created };
  }

  async function statBlob(sha256: string): Promise<BlobStat | null> {
    const info = await statOrNull(blobPath(sha256));
    return info === null ? null : { size: info.size, storedAt: new Date(info.mtimeMs).toISOString() };
  }

  async function openBlob(sha256: string, range?: BlobRange): Promise<Readable> {
    const file = blobPath(sha256);
    const info = await statOrNull(file);
    if (info === null) throw new BlobNotFoundError();
    if (range === undefined) return createReadStream(file, { highWaterMark: READ_CHUNK });
    const end = range.end ?? info.size - 1;
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(end) || range.start < 0 || end < range.start || end >= info.size) throw new InvalidBlobRangeError();
    return createReadStream(file, { start: range.start, end, highWaterMark: READ_CHUNK });
  }

  async function verify(sha256: string): Promise<BlobVerifyResult> {
    let stream: Readable;
    try {
      stream = await openBlob(sha256);
    } catch (error) {
      if (error instanceof BlobNotFoundError) return 'missing';
      throw error;
    }
    const hash = createHash('sha256');
    try {
      for await (const chunk of stream) hash.update(chunk as Uint8Array);
    } catch (error) {
      if (isCode(error, 'ENOENT')) return 'missing';
      throw error;
    }
    return hash.digest('hex') === sha256 ? 'ok' : 'corrupt';
  }

  async function names(dir: string): Promise<string[]> {
    try { return (await readdir(dir)).sort(); } catch (error) { if (isCode(error, 'ENOENT')) return []; throw error; }
  }

  async function list(after?: string, limit = 1000): Promise<Array<{ sha256: string; size: number }>> {
    if (after !== undefined) assertBlobHash(after);
    const out: Array<{ sha256: string; size: number }> = [];
    for (const a of await names(paths.blobsDir)) {
      if (!/^[0-9a-f]{2}$/.test(a) || (after !== undefined && a < after.slice(0, 2))) continue;
      for (const b of await names(path.join(paths.blobsDir, a))) {
        if (!/^[0-9a-f]{2}$/.test(b) || (after !== undefined && a === after.slice(0, 2) && b < after.slice(2, 4))) continue;
        for (const name of await names(path.join(paths.blobsDir, a, b))) {
          if (!/^[0-9a-f]{64}$/.test(name) || !name.startsWith(a + b) || (after !== undefined && name <= after)) continue;
          const info = await statOrNull(path.join(paths.blobsDir, a, b, name));
          if (info === null) continue;
          out.push({ sha256: name, size: info.size });
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  return {
    put,
    open: openBlob,
    stat: statBlob,
    has: async (sha256) => (await statBlob(sha256)) !== null,
    list,
    delete: async (sha256) => {
      try { await unlink(blobPath(sha256)); } catch (error) { if (!isCode(error, 'ENOENT')) throw error; }
    },
    verify,
    sweepStaging: async (maxAgeMs, now = Date.now()) => {
      let removed = 0;
      for (const name of await names(paths.stagingDir)) {
        if (!name.endsWith(STAGING_SUFFIX)) continue;
        const file = path.join(paths.stagingDir, name);
        const info = await statOrNull(file);
        if (info === null || now - info.mtimeMs < maxAgeMs) continue;
        try { await unlink(file); removed += 1; } catch (error) { if (!isCode(error, 'ENOENT')) throw error; }
      }
      return removed;
    },
  };
}
