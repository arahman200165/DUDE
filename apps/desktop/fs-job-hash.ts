import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { HashAlgorithm } from "@dude/crypto/hash-compute";
import type { WalkEntry } from "@dude/contracts/fs/fs-types";
import { sanitizeWalkOptions } from "@dude/tool-engine/shared/fs/walk-filter";
import { merkleHash, type ManifestEntry, type ParsedLine } from "@dude/tool-engine/shared/fs/manifest-format";
import { diffSnapshots, type Snapshot, type SnapshotFile, type SnapshotHeader } from "@dude/contracts/fs/snapshot-diff";
import { upsertSnapshotHeader } from './device-store/snapshot-index';
import { registerFsJob, type FsJobContext } from './fs-jobs';
import { algorithmsOf, paramsOf } from './fs-job-walk';
import { hashFile } from './fs-hash';
import { walkTree } from './fs-walk';
import { resolveInRoot } from './fs-paths';

/**
 * Hash Manifest & Snapshot jobs (Phase 29 items 9, 15, 16, Milestone 527): bulk streaming hashes
 * with a deterministic Merkle directory hash, manifest verification, and folder snapshots saved to
 * a local library (`userData/snapshots/`, app data — never written into the user's folder).
 */

const HASH_CONCURRENCY = 4;
const MAX_FOLDER_HASHES = 20_000;

export function snapshotsDir(userData: string): string { return join(userData, 'snapshots'); }

async function listTree(context: FsJobContext, phase: string): Promise<{ files: WalkEntry[]; dirs: string[] }> {
  const options = sanitizeWalkOptions(paramsOf(context)['options']);
  const files: WalkEntry[] = [];
  const dirs: string[] = [];
  await walkTree(context.root, options, {
    signal: context.signal,
    includeDirs: true,
    onEntry: (entry) => {
      if (entry.kind === 'file') files.push(entry);
      else if (entry.kind === 'dir') dirs.push(entry.path);
      context.progress({ phase, scanned: files.length, bytes: 0, current: entry.path });
    },
    onIssue: (issue) => context.issue(issue),
  }, options.skipHidden ? context.attributes : null);
  return { files, dirs };
}

/** Hashes files with bounded concurrency, in walk order, calling `each` as every file finishes. */
async function hashAll(context: FsJobContext, files: readonly WalkEntry[], algorithms: readonly HashAlgorithm[], each: (entry: WalkEntry, digests: Record<string, string> | null, error?: string) => void): Promise<void> {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let bytes = 0;
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      if (context.signal.aborted) throw new Error('Cancelled.');
      const entry = files[next++];
      const absolute = resolveInRoot(context.root, entry.path);
      try {
        if (!absolute) throw new Error('Path escapes the folder.');
        each(entry, await hashFile(absolute, algorithms, { signal: context.signal, onBytes: (count) => { bytes += count; context.progress({ phase: 'Hashing', scanned: done, bytes, total, current: entry.path }); } }));
      } catch (error) {
        if (context.signal.aborted) throw new Error('Cancelled.');
        each(entry, null, error instanceof Error ? error.message : String(error));
      }
      done++;
    }
  };
  await Promise.all(Array.from({ length: HASH_CONCURRENCY }, worker));
}

registerFsJob('hash-manifest', async (context) => {
  const params = paramsOf(context);
  const requested = algorithmsOf(params['algorithms']);
  const algorithms = requested.includes('SHA-256') ? requested : [...requested, 'SHA-256' as HashAlgorithm];
  const { files, dirs } = await listTree(context, 'Listing');
  const sha = new Map<string, string>();
  let failed = 0;
  await hashAll(context, files, algorithms, (entry, digests, error) => {
    if (!digests) { failed++; context.issue({ path: entry.path, code: 'READ', message: error ?? 'Could not read.' }); return; }
    sha.set(entry.path, digests['SHA-256']);
    const manifest: ManifestEntry = { path: entry.path, size: entry.size, mtimeMs: entry.mtimeMs, digests: Object.fromEntries(requested.map((algorithm) => [algorithm, digests[algorithm]])) };
    context.batch(manifest);
  });
  const merkle = merkleHash(sha, dirs);
  const folderHashes = [...merkle.folders].sort((a, b) => a[0].split('/').length - b[0].split('/').length || (a[0] < b[0] ? -1 : 1)).slice(0, MAX_FOLDER_HASHES);
  return { algorithms: requested, files: files.length, dirs: dirs.length, failed, bytes: files.reduce((sum, file) => sum + file.size, 0), directoryHash: failed ? null : merkle.root, folderHashes };
});

export type VerifyStatus = 'ok' | 'mismatch' | 'missing' | 'error' | 'unsupported' | 'extra';

registerFsJob('verify-manifest', async (context) => {
  const params = paramsOf(context);
  const entries = (Array.isArray(params['entries']) ? params['entries'] : []).slice(0, 2_000_000) as ParsedLine[];
  const counts: Record<VerifyStatus, number> = { ok: 0, mismatch: 0, missing: 0, error: 0, unsupported: 0, extra: 0 };
  const listed = new Set<string>();
  let done = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (context.signal.aborted) throw new Error('Cancelled.');
    const path = typeof entry.path === 'string' ? entry.path.replace(/\\/g, '/').replace(/^\.\//, '') : '';
    listed.add(path.toLowerCase());
    const report = (status: VerifyStatus, actual?: string, message?: string) => { counts[status]++; context.batch({ path, status, algorithm: entry.algorithm, expected: entry.digest, actual, message }); };
    const absolute = path ? resolveInRoot(context.root, path) : null;
    if (!entry.algorithm) { report('unsupported', undefined, 'Unknown algorithm — pick one for this manifest.'); continue; }
    if (!absolute) { report('error', undefined, 'Path escapes the folder.'); continue; }
    try {
      const info = await fs.stat(absolute);
      if (!info.isFile()) { report('missing', undefined, 'Not a file.'); continue; }
      const digest = (await hashFile(absolute, [entry.algorithm], { signal: context.signal, onBytes: (count) => { bytes += count; context.progress({ phase: 'Verifying', scanned: done, bytes, total: entries.length, current: path }); } }))[entry.algorithm];
      report(digest === entry.digest.toLowerCase() ? 'ok' : 'mismatch', digest);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (context.signal.aborted) throw new Error('Cancelled.');
      report(code === 'ENOENT' ? 'missing' : 'error', undefined, code === 'ENOENT' ? undefined : (error as Error).message);
    }
    done++;
  }
  if (params['reportExtra'] === true) {
    const { files } = await listTree(context, 'Looking for unlisted files');
    for (const file of files) if (!listed.has(file.path.toLowerCase())) { counts.extra++; context.batch({ path: file.path, status: 'extra' }); }
  }
  return { counts, checked: entries.length };
});

// ---- Snapshots ----

async function readSnapshot(userData: string, id: unknown): Promise<Snapshot> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('Unknown snapshot.');
  return JSON.parse(await fs.readFile(join(snapshotsDir(userData), `${id}.json`), 'utf8')) as Snapshot;
}

async function snapshotOf(context: FsJobContext, algorithm: HashAlgorithm | null, rehash?: (file: WalkEntry) => boolean): Promise<Pick<Snapshot, 'entries' | 'directories'> & { directoryHash?: string }> {
  const { files, dirs } = await listTree(context, 'Listing');
  const hashes = new Map<string, string>();
  const toHash = algorithm ? files.filter((file) => !rehash || rehash(file)) : [];
  if (algorithm && toHash.length) {
    await hashAll(context, toHash, [algorithm], (entry, digests, error) => {
      if (digests) hashes.set(entry.path, digests[algorithm]);
      else context.issue({ path: entry.path, code: 'READ', message: error ?? 'Could not read.' });
    });
  }
  const entries: SnapshotFile[] = files.map((file) => ({ path: file.path, size: file.size, mtimeMs: file.mtimeMs, ...(hashes.has(file.path) ? { hash: hashes.get(file.path) } : {}) }));
  const directoryHash = algorithm === 'SHA-256' && hashes.size === files.length ? merkleHash(hashes, dirs).root : undefined;
  return { entries, directories: dirs, ...(directoryHash ? { directoryHash } : {}) };
}

registerFsJob('snapshot-take', async (context) => {
  const params = paramsOf(context);
  const algorithm = params['algorithm'] ? algorithmsOf([params['algorithm']])[0] : null;
  const body = await snapshotOf(context, algorithm);
  const { userData } = context;
  const header: SnapshotHeader = {
    id: randomUUID(),
    label: typeof params['label'] === 'string' && params['label'].trim() ? params['label'].trim().slice(0, 200) : new Date().toISOString().slice(0, 16).replace('T', ' '),
    root: context.root,
    takenAt: new Date().toISOString(),
    files: body.entries.length,
    dirs: body.directories.length,
    bytes: body.entries.reduce((sum, entry) => sum + entry.size, 0),
    algorithm,
    ...(body.directoryHash ? { directoryHash: body.directoryHash } : {}),
  };
  await fs.mkdir(snapshotsDir(userData), { recursive: true });
  await fs.writeFile(join(snapshotsDir(userData), `${header.id}.json`), JSON.stringify({ ...header, entries: body.entries, directories: body.directories }), 'utf8');
  await fs.writeFile(join(snapshotsDir(userData), `${header.id}.header.json`), JSON.stringify(header), 'utf8');
  await upsertSnapshotHeader('fs', header.id, header, header.takenAt);
  return { header };
});

/**
 * Snapshot ↔ live rescan. Only files whose size is unchanged but whose mtime moved (possible edits),
 * plus new files (possible moves), are re-hashed — the rest compare on metadata alone.
 */
registerFsJob('snapshot-live-diff', async (context) => {
  const params = paramsOf(context);
  const { userData } = context;
  const base = await readSnapshot(userData, params['baseId']);
  const byPath = new Map(base.entries.map((entry) => [entry.path, entry]));
  const live = await snapshotOf(context, base.algorithm, (file) => {
    const old = byPath.get(file.path);
    return !old || (old.size === file.size && Math.abs(old.mtimeMs - file.mtimeMs) >= 2);
  });
  // Unchanged files keep the snapshot's hash so the diff can compare content where it was needed.
  const entries = live.entries.map((entry) => {
    const old = byPath.get(entry.path);
    return !entry.hash && old?.hash && old.size === entry.size && Math.abs(old.mtimeMs - entry.mtimeMs) < 2 ? { ...entry, hash: old.hash } : entry;
  });
  const diff = diffSnapshots(base, { entries, directories: live.directories });
  for (const item of diff.items) context.batch(item);
  return { counts: diff.counts, addedDirs: diff.addedDirs, removedDirs: diff.removedDirs, base: { ...base, entries: undefined, directories: undefined } };
});
