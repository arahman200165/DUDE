import type { HashAlgorithm } from '../hash-compute';

/**
 * Folder snapshots and their diff (Phase 29 item 16, Milestone 527). A snapshot is a flat
 * path → size/mtime/(hash) record of a folder at a moment; diffing two (or a snapshot against a live
 * rescan) classifies every path. With hashes, a removed+added pair with identical content is
 * reported as a move instead of two unrelated changes.
 */

export interface SnapshotFile {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly hash?: string;
}

export interface SnapshotHeader {
  readonly id: string;
  readonly label: string;
  readonly root: string;
  readonly takenAt: string;
  readonly files: number;
  readonly dirs: number;
  readonly bytes: number;
  readonly algorithm: HashAlgorithm | null;
  readonly directoryHash?: string;
}

export interface Snapshot extends SnapshotHeader {
  readonly entries: readonly SnapshotFile[];
  readonly directories: readonly string[];
}

export type SnapshotChange = 'added' | 'removed' | 'modified' | 'touched' | 'moved';

export interface SnapshotDiffItem {
  readonly change: SnapshotChange;
  readonly path: string;
  readonly from?: string;
  readonly before?: SnapshotFile;
  readonly after?: SnapshotFile;
}

export interface SnapshotDiff {
  readonly items: readonly SnapshotDiffItem[];
  readonly counts: Readonly<Record<SnapshotChange | 'unchanged', number>>;
  readonly addedDirs: readonly string[];
  readonly removedDirs: readonly string[];
}

/**
 * `modified` = size or content hash differs; `touched` = same size (and hash, when both have one)
 * but a different mtime. When only one side is hashed, content can't be compared, so a same-size
 * file with a new mtime counts as `modified` (possibly changed) rather than `touched`.
 */
export function diffSnapshots(base: Pick<Snapshot, 'entries' | 'directories'>, next: Pick<Snapshot, 'entries' | 'directories'>): SnapshotDiff {
  const before = new Map(base.entries.map((entry) => [entry.path, entry]));
  const after = new Map(next.entries.map((entry) => [entry.path, entry]));
  const items: SnapshotDiffItem[] = [];
  const counts = { added: 0, removed: 0, modified: 0, touched: 0, moved: 0, unchanged: 0 };
  const removed: SnapshotFile[] = [];
  const added: SnapshotFile[] = [];
  for (const [path, old] of before) {
    const current = after.get(path);
    if (!current) { removed.push(old); continue; }
    const hashed = !!old.hash && !!current.hash;
    if (old.size !== current.size || (hashed && old.hash !== current.hash)) { items.push({ change: 'modified', path, before: old, after: current }); counts.modified++; }
    else if (Math.abs(old.mtimeMs - current.mtimeMs) >= 2) {
      const change = hashed ? 'touched' : 'modified';
      items.push({ change, path, before: old, after: current });
      counts[change]++;
    } else counts.unchanged++;
  }
  for (const [path, current] of after) if (!before.has(path)) added.push(current);
  const addedByHash = new Map<string, SnapshotFile[]>();
  for (const file of added) if (file.hash) addedByHash.set(`${file.hash}:${file.size}`, [...(addedByHash.get(`${file.hash}:${file.size}`) ?? []), file]);
  const movedTargets = new Set<string>();
  for (const file of removed) {
    const candidates = file.hash ? addedByHash.get(`${file.hash}:${file.size}`) : undefined;
    const target = candidates?.find((candidate) => !movedTargets.has(candidate.path));
    if (target) {
      movedTargets.add(target.path);
      items.push({ change: 'moved', path: target.path, from: file.path, before: file, after: target });
      counts.moved++;
    } else { items.push({ change: 'removed', path: file.path, before: file }); counts.removed++; }
  }
  for (const file of added) if (!movedTargets.has(file.path)) { items.push({ change: 'added', path: file.path, after: file }); counts.added++; }
  const dirsBefore = new Set(base.directories);
  const dirsAfter = new Set(next.directories);
  return {
    items: items.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    counts,
    addedDirs: [...dirsAfter].filter((dir) => !dirsBefore.has(dir)).sort(),
    removedDirs: [...dirsBefore].filter((dir) => !dirsAfter.has(dir)).sort(),
  };
}

/** Validates an imported snapshot file; returns null when it isn't a DUDE snapshot. */
export function parseSnapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Snapshot>;
  if (typeof raw.root !== 'string' || typeof raw.takenAt !== 'string' || !Array.isArray(raw.entries)) return null;
  const entries = raw.entries.filter((entry): entry is SnapshotFile => !!entry && typeof entry.path === 'string' && typeof entry.size === 'number' && typeof entry.mtimeMs === 'number')
    .map((entry) => ({ path: entry.path, size: entry.size, mtimeMs: entry.mtimeMs, ...(typeof entry.hash === 'string' ? { hash: entry.hash } : {}) }));
  const directories = Array.isArray(raw.directories) ? raw.directories.filter((dir): dir is string => typeof dir === 'string') : [];
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    label: typeof raw.label === 'string' ? raw.label.slice(0, 200) : 'Imported snapshot',
    root: raw.root,
    takenAt: raw.takenAt,
    files: entries.length,
    dirs: directories.length,
    bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    algorithm: typeof raw.algorithm === 'string' ? raw.algorithm : null,
    ...(typeof raw.directoryHash === 'string' ? { directoryHash: raw.directoryHash } : {}),
    entries,
    directories,
  };
}
