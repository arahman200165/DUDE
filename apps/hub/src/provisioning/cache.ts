import { lstatSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * The bound on `storage/cache` (previews, thumbnails, transcoding scratch). Disposable, never backed up; provisioning sweeps it back
 * under the bound. A later milestone may make it a `hub.json` setting; today it is this constant.
 */
export const DEFAULT_CACHE_MAX_BYTES = 1024 * 1024 * 1024;

/** A cache with more files than this is walked no further (the figure then reads as "at least"). */
export const CACHE_WALK_LIMIT = 50_000;

interface CacheFile { file: string; size: number; mtimeMs: number }

export interface CacheStats {
  files: number;
  bytes: number;
  /** True when the walk stopped at `CACHE_WALK_LIMIT`. */
  truncated: boolean;
}

function walk(dir: string, into: CacheFile[], limit: number): boolean {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return false; }
  for (const entry of entries) {
    if (into.length >= limit) return true;
    const full = path.join(dir, entry.name);
    // A link is never followed and never counted: the sweep must not reach outside the cache directory.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (walk(full, into, limit)) return true;
    } else if (entry.isFile()) {
      try {
        const info = lstatSync(full);
        into.push({ file: full, size: info.size, mtimeMs: info.mtimeMs });
      } catch { /* vanished */ }
    }
  }
  return false;
}

export function cacheStats(dir: string, limit = CACHE_WALK_LIMIT): CacheStats {
  const files: CacheFile[] = [];
  const truncated = walk(dir, files, limit);
  return { files: files.length, bytes: files.reduce((sum, f) => sum + f.size, 0), truncated };
}

/**
 * Deletes the oldest cache files until the total is at or under `maxBytes`; returns how many it removed. Only regular files inside
 * `dir` are touched (links are skipped), and a missing directory is a no-op. The cache is disposable by definition, so this is not a
 * destructive action in the Destructive-Action Contract's sense.
 */
export function sweepCache(dir: string, maxBytes: number = DEFAULT_CACHE_MAX_BYTES, limit = CACHE_WALK_LIMIT): number {
  const files: CacheFile[] = [];
  walk(dir, files, limit);
  let total = files.reduce((sum, f) => sum + f.size, 0);
  if (total <= maxBytes) return 0;
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  let removed = 0;
  for (const entry of files) {
    if (total <= maxBytes) break;
    try {
      rmSync(entry.file, { force: true });
      total -= entry.size;
      removed += 1;
    } catch { /* in use; the next sweep retries */ }
  }
  return removed;
}
