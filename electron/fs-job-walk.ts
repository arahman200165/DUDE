import { promises as fs } from 'node:fs';
import { HASH_ALGORITHMS, type HashAlgorithm } from '../src/shared-logic/hash-compute';
import { sanitizeWalkOptions } from '../src/shared-logic/fs/walk-filter';
import { registerFsJob, type FsJobContext } from './fs-jobs';
import { hashFile } from './fs-hash';
import { walkTree } from './fs-walk';

/** Foundation job kinds (Milestone 523): a generic filtered walk, and streaming hash of one granted file. */

export function paramsOf(context: FsJobContext): Record<string, unknown> {
  return context.params && typeof context.params === 'object' ? (context.params as Record<string, unknown>) : {};
}

export function algorithmsOf(value: unknown, fallback: readonly HashAlgorithm[] = ['SHA-256']): HashAlgorithm[] {
  const list = Array.isArray(value) ? value.filter((item): item is HashAlgorithm => HASH_ALGORITHMS.includes(item as HashAlgorithm)) : [];
  return list.length ? [...new Set(list)] : [...fallback];
}

registerFsJob('walk', async (context) => {
  const params = paramsOf(context);
  const options = sanitizeWalkOptions(params['options']);
  let scanned = 0;
  let bytes = 0;
  const stats = await walkTree(context.root, options, {
    signal: context.signal,
    includeDirs: params['includeDirs'] === true,
    onEntry: (entry) => {
      scanned++;
      bytes += entry.size;
      context.batch(entry);
      context.progress({ phase: 'walking', scanned, bytes, current: entry.path });
    },
    onIssue: (issue) => context.issue(issue),
  }, options.skipHidden ? context.attributes : null);
  return { stats };
});

registerFsJob('hash-file', async (context) => {
  const params = paramsOf(context);
  const info = await fs.stat(context.root);
  if (!info.isFile()) throw new Error('Pick a file to hash.');
  const start = typeof params['start'] === 'number' && params['start'] >= 0 ? Math.floor(params['start']) : 0;
  const end = typeof params['end'] === 'number' && params['end'] >= start ? Math.floor(params['end']) : Math.max(0, info.size - 1);
  const total = info.size === 0 ? 0 : end - start + 1;
  let bytes = 0;
  const digests = await hashFile(context.root, algorithmsOf(params['algorithms']), {
    signal: context.signal,
    start,
    end: info.size === 0 ? undefined : end,
    onBytes: (count) => { bytes += count; context.progress({ phase: 'hashing', scanned: 1, bytes, total }); },
  });
  return { size: info.size, start, end, bytes: total, digests };
});
