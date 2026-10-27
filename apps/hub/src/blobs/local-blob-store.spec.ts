import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, statSync, utimesSync, openSync, writeSync, closeSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { hubPaths } from '../config/data-dir.js';
import { BlobHashMismatchError, BlobNotFoundError, BlobTooLargeError, InvalidBlobHashError, InvalidBlobRangeError } from './blob-store.js';
import { createLocalBlobStore } from './local-blob-store.js';
import type { LocalBlobStoreHooks } from './local-blob-store.js';

const sha = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
const collect = async (stream: AsyncIterable<Uint8Array>): Promise<Buffer> => {
  const parts: Buffer[] = [];
  for await (const chunk of stream) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
};
const filesUnder = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));
};

function setup(hooks: LocalBlobStoreHooks = {}) {
  const paths = hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-blobs-')));
  return { paths, store: createLocalBlobStore(paths, hooks) };
}

describe('local BlobStore', () => {
  it('stores content at storage/blobs/<aa>/<bb>/<sha256>, creating directories lazily', async () => {
    const { paths, store } = setup();
    expect(existsSync(paths.storageDir)).toBe(false);
    const result = await store.put(Buffer.from('hello blob'));
    const expected = sha('hello blob');
    expect(result).toEqual({ sha256: expected, size: 10, created: true });
    expect(filesUnder(paths.blobsDir)).toEqual([path.join(paths.blobsDir, expected.slice(0, 2), expected.slice(2, 4), expected)]);
    expect(filesUnder(paths.stagingDir)).toEqual([]);
    expect((await collect(await store.open(expected))).toString()).toBe('hello blob');
    expect(await store.stat(expected)).toMatchObject({ size: 10 });
    expect(await store.has(expected)).toBe(true);
    expect(await store.has(sha('other'))).toBe(false);
    expect(await store.stat(sha('other'))).toBeNull();
  });

  it('dedupes: a second put of the same bytes writes nothing and reports created: false', async () => {
    const { paths, store } = setup();
    const first = await store.put(Buffer.from('same'));
    const second = await store.put(Readable.from([Buffer.from('sa'), Buffer.from('me')]));
    expect(second).toEqual({ sha256: first.sha256, size: 4, created: false });
    expect(filesUnder(paths.blobsDir)).toHaveLength(1);
    expect(filesUnder(paths.stagingDir)).toEqual([]);
  });

  it('streams a 64 MiB body chunk by chunk (each chunk is on disk before the next is requested)', async () => {
    const { paths, store } = setup();
    const chunk = Buffer.alloc(1024 * 1024, 0x5a);
    const total = 64;
    const expected = createHash('sha256');
    for (let i = 0; i < total; i += 1) expected.update(chunk);
    let produced = 0;
    let worstLag = 0;
    async function* source(): AsyncGenerator<Uint8Array> {
      for (let i = 0; i < total; i += 1) {
        const staged = filesUnder(paths.stagingDir)[0];
        if (staged !== undefined) worstLag = Math.max(worstLag, produced - statSync(staged).size);
        produced += chunk.byteLength;
        yield chunk;
      }
    }
    const result = await store.put(source());
    expect(result).toEqual({ sha256: expected.digest('hex'), size: total * chunk.byteLength, created: true });
    // A buffering implementation would show a lag growing towards 64 MiB; a streaming one never trails by more than a chunk.
    expect(worstLag).toBeLessThanOrEqual(chunk.byteLength);
    expect(await store.verify(result.sha256)).toBe('ok');
    expect(statSync(filesUnder(paths.blobsDir)[0]!).size).toBe(total * chunk.byteLength);
  }, 60_000);

  it('rejects content that does not match expectedSha256 and keeps nothing', async () => {
    const { paths, store } = setup();
    await expect(store.put(Buffer.from('actual'), { expectedSha256: sha('claimed') })).rejects.toBeInstanceOf(BlobHashMismatchError);
    expect(filesUnder(paths.blobsDir)).toEqual([]);
    expect(filesUnder(paths.stagingDir)).toEqual([]);
    await expect(store.put(Buffer.from('actual'), { expectedSha256: 'NOT-HEX' })).rejects.toBeInstanceOf(InvalidBlobHashError);
    const ok = await store.put(Buffer.from('actual'), { expectedSha256: sha('actual') });
    expect(ok.created).toBe(true);
  });

  it('aborts an oversized or failing source and cleans its staging file', async () => {
    const { paths, store } = setup();
    await expect(store.put(Buffer.alloc(100), { maxBytes: 99 })).rejects.toBeInstanceOf(BlobTooLargeError);
    async function* failing(): AsyncGenerator<Uint8Array> {
      yield Buffer.from('partial');
      throw new Error('network dropped');
    }
    await expect(store.put(failing())).rejects.toThrow('network dropped');
    expect(filesUnder(paths.stagingDir)).toEqual([]);
    expect(filesUnder(paths.blobsDir)).toEqual([]);
  });

  it('rejects traversal and non-hex hashes on every method', async () => {
    const { store } = setup();
    const bad = ['../../../etc/passwd', '..\\..\\x', 'a'.repeat(63), 'A'.repeat(64), `${'a'.repeat(63)}/`, `${'a'.repeat(62)}..`, '', 'g'.repeat(64)];
    for (const hash of bad) {
      await expect(store.open(hash)).rejects.toBeInstanceOf(InvalidBlobHashError);
      await expect(store.stat(hash)).rejects.toBeInstanceOf(InvalidBlobHashError);
      await expect(store.has(hash)).rejects.toBeInstanceOf(InvalidBlobHashError);
      await expect(store.delete(hash)).rejects.toBeInstanceOf(InvalidBlobHashError);
      await expect(store.verify(hash)).rejects.toBeInstanceOf(InvalidBlobHashError);
    }
  });

  it('opens a byte range and refuses one outside the blob', async () => {
    const { store } = setup();
    const { sha256 } = await store.put(Buffer.from('0123456789'));
    expect((await collect(await store.open(sha256, { start: 2, end: 5 }))).toString()).toBe('2345');
    expect((await collect(await store.open(sha256, { start: 7 }))).toString()).toBe('789');
    await expect(store.open(sha256, { start: 5, end: 10 })).rejects.toBeInstanceOf(InvalidBlobRangeError);
    await expect(store.open(sha256, { start: 5, end: 4 })).rejects.toBeInstanceOf(InvalidBlobRangeError);
    await expect(store.open(sha('nope'))).rejects.toBeInstanceOf(BlobNotFoundError);
  });

  it('verify reports ok, corrupt after a bit flip, and missing', async () => {
    const { paths, store } = setup();
    const { sha256 } = await store.put(Buffer.from('precious bytes'));
    expect(await store.verify(sha256)).toBe('ok');
    const file = filesUnder(paths.blobsDir)[0]!;
    const fd = openSync(file, 'r+');
    writeSync(fd, Buffer.from([0x01]), 0, 1, 3);
    closeSync(fd);
    expect(await store.verify(sha256)).toBe('corrupt');
    await store.delete(sha256);
    expect(await store.verify(sha256)).toBe('missing');
    await store.delete(sha256);
  });

  it('lists blobs in hash order, strictly after a cursor', async () => {
    const { store } = setup();
    const hashes = (await Promise.all(['a', 'b', 'c', 'd', 'e'].map((x) => store.put(Buffer.from(x))))).map((r) => r.sha256).sort();
    const all = await store.list();
    expect(all.map((b) => b.sha256)).toEqual(hashes);
    expect((await store.list(hashes[1], 2)).map((b) => b.sha256)).toEqual([hashes[2], hashes[3]]);
    expect(await store.list(hashes[4])).toEqual([]);
  });

  describe('crash injection', () => {
    it('a kill after the staged file is complete but before the link leaves only staging junk, never a visible blob', async () => {
      let seen: { blobs: string[]; staging: string[] } | undefined;
      const crash = new Error('simulated kill');
      const ctx = setup({
        beforeCommit: () => {
          seen = { blobs: filesUnder(ctx.paths.blobsDir), staging: filesUnder(ctx.paths.stagingDir) };
          throw crash;
        },
      });
      const expected = sha('in flight');
      await expect(ctx.store.put(Buffer.from('in flight'))).rejects.toBe(crash);
      expect(seen!.blobs).toEqual([]);
      expect(seen!.staging).toHaveLength(1);
      expect(await ctx.store.has(expected)).toBe(false);
      await expect(ctx.store.open(expected)).rejects.toBeInstanceOf(BlobNotFoundError);
      expect(filesUnder(ctx.paths.blobsDir)).toEqual([]);
      expect(filesUnder(ctx.paths.stagingDir)).toHaveLength(1);

      // The sweeper keeps fresh files (a put may be in flight) and removes stale ones.
      const junk = filesUnder(ctx.paths.stagingDir)[0]!;
      const now = Date.now();
      expect(await ctx.store.sweepStaging(60 * 60_000, now)).toBe(0);
      expect(existsSync(junk)).toBe(true);
      utimesSync(junk, new Date(now - 2 * 3600_000), new Date(now - 2 * 3600_000));
      expect(await ctx.store.sweepStaging(60 * 60_000, now)).toBe(1);
      expect(filesUnder(ctx.paths.stagingDir)).toEqual([]);
    });

    it('a kill right after the link leaves a complete blob plus a stale staging name; the sweeper removes only the latter', async () => {
      const crash = new Error('simulated kill');
      const ctx = setup({ afterCommit: () => { throw crash; } });
      const body = Buffer.from('linked then killed');
      await expect(ctx.store.put(body)).rejects.toBe(crash);
      // Depending on where it died, the staging name is already unlinked or not; the blob is complete either way.
      const expected = sha(body);
      expect(await ctx.store.verify(expected)).toBe('ok');
      const staging = filesUnder(ctx.paths.stagingDir);
      const now = Date.now() + 2 * 3600_000;
      await ctx.store.sweepStaging(3600_000, now);
      expect(filesUnder(ctx.paths.stagingDir)).toEqual([]);
      expect(await ctx.store.verify(expected)).toBe('ok');
      expect(staging.length).toBeLessThanOrEqual(1);
    });

    it('a retry after a crash completes normally, and the sweeper ignores non-staging files', async () => {
      let failures = 1;
      const ctx = setup({ beforeCommit: () => { if (failures-- > 0) throw new Error('kill'); } });
      await expect(ctx.store.put(Buffer.from('retry me'))).rejects.toThrow('kill');
      const retried = await ctx.store.put(Buffer.from('retry me'));
      expect(retried.created).toBe(true);
      writeFileSync(path.join(ctx.paths.stagingDir, 'notes.txt'), 'keep');
      const old = Date.now() + 10 * 3600_000;
      expect(await ctx.store.sweepStaging(1000, old)).toBe(1);
      expect(readdirSync(ctx.paths.stagingDir)).toEqual(['notes.txt']);
      expect(await ctx.store.verify(retried.sha256)).toBe('ok');
    });
  });
});
