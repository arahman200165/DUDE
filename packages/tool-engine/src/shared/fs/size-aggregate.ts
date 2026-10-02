import type { WalkEntry } from "@dude/contracts/fs/fs-types";

/**
 * Streaming folder-size aggregation (Phase 29 item 1, Milestone 525). Runs inside the fs utility
 * process over a drive-scale walk: it keeps one small record per directory plus bounded top-N lists,
 * never the full file list, and prunes the directory list it returns so a whole-drive report stays a
 * few megabytes. Pure, so it's unit-tested without a filesystem.
 */

export interface SizeNode {
  /** Posix path relative to the root; '' is the root itself. */
  readonly path: string;
  readonly size: number;
  readonly files: number;
  readonly dirs: number;
  /** Bytes/files directly inside this folder (not in subfolders). */
  readonly ownBytes: number;
  readonly ownFiles: number;
  /** Subfolders left out of `nodes` because they were too small to matter (see `pruneNodes`). */
  readonly hiddenDirs: number;
  readonly hiddenBytes: number;
}

export interface SizedFile { readonly path: string; readonly size: number; readonly mtimeMs: number }
export interface ExtensionBucket { readonly extension: string; readonly bytes: number; readonly files: number }
export interface AgeBucket { readonly label: string; readonly maxAgeDays: number | null; readonly bytes: number; readonly files: number }

export interface SizeReport {
  readonly totalBytes: number;
  readonly totalFiles: number;
  readonly totalDirs: number;
  readonly links: number;
  readonly nodes: readonly SizeNode[];
  readonly prunedDirs: number;
  readonly largestFiles: readonly SizedFile[];
  readonly byExtension: readonly ExtensionBucket[];
  readonly byAge: readonly AgeBucket[];
}

export const AGE_BUCKETS: readonly { label: string; maxAgeDays: number | null }[] = [
  { label: '< 1 week', maxAgeDays: 7 },
  { label: '< 1 month', maxAgeDays: 30 },
  { label: '< 3 months', maxAgeDays: 90 },
  { label: '< 1 year', maxAgeDays: 365 },
  { label: '< 3 years', maxAgeDays: 1095 },
  { label: 'Older', maxAgeDays: null },
];

interface MutableDir { size: number; files: number; dirs: number; ownBytes: number; ownFiles: number }

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export class SizeAggregator {
  private readonly dirs = new Map<string, MutableDir>([['', { size: 0, files: 0, dirs: 0, ownBytes: 0, ownFiles: 0 }]]);
  private readonly extensions = new Map<string, { bytes: number; files: number }>();
  private readonly ages = AGE_BUCKETS.map(() => ({ bytes: 0, files: 0 }));
  private largest: SizedFile[] = [];
  private links = 0;

  constructor(private readonly now = Date.now(), private readonly topFiles = 200) {}

  add(entry: WalkEntry): void {
    if (entry.kind === 'link') { this.links++; return; }
    if (entry.kind === 'dir') { this.dir(entry.path); return; }
    const parent = this.dir(parentOf(entry.path));
    parent.ownBytes += entry.size;
    parent.ownFiles++;
    const extension = extensionOf(entry.path);
    const bucket = this.extensions.get(extension) ?? { bytes: 0, files: 0 };
    bucket.bytes += entry.size;
    bucket.files++;
    this.extensions.set(extension, bucket);
    const ageDays = (this.now - entry.mtimeMs) / 86_400_000;
    const index = AGE_BUCKETS.findIndex((age) => age.maxAgeDays === null || ageDays < age.maxAgeDays);
    this.ages[index].bytes += entry.size;
    this.ages[index].files++;
    this.largest.push({ path: entry.path, size: entry.size, mtimeMs: entry.mtimeMs });
    if (this.largest.length > this.topFiles * 2) this.trimLargest();
  }

  private dir(path: string): MutableDir {
    let record = this.dirs.get(path);
    if (!record) {
      record = { size: 0, files: 0, dirs: 0, ownBytes: 0, ownFiles: 0 };
      this.dirs.set(path, record);
      if (path) this.dir(parentOf(path));
    }
    return record;
  }

  private trimLargest(): void {
    this.largest.sort((a, b) => b.size - a.size);
    this.largest.length = Math.min(this.largest.length, this.topFiles);
  }

  /** Rolls own sizes up to every ancestor (deepest first) and builds the report. */
  finish(maxNodes = 100_000): SizeReport {
    const paths = [...this.dirs.keys()].sort((a, b) => depthOf(b) - depthOf(a));
    for (const path of paths) {
      const record = this.dirs.get(path)!;
      record.size += record.ownBytes;
      record.files += record.ownFiles;
      if (!path) continue;
      const parent = this.dirs.get(parentOf(path))!;
      parent.size += record.size;
      parent.files += record.files;
      parent.dirs += record.dirs + 1;
    }
    this.trimLargest();
    const root = this.dirs.get('')!;
    const nodes = pruneNodes([...this.dirs].map(([path, record]) => ({ path, ...record, hiddenDirs: 0, hiddenBytes: 0 })), root.size, maxNodes);
    return {
      totalBytes: root.size,
      totalFiles: root.files,
      totalDirs: this.dirs.size - 1,
      links: this.links,
      nodes: nodes.kept,
      prunedDirs: nodes.pruned,
      largestFiles: this.largest,
      byExtension: [...this.extensions].map(([extension, value]) => ({ extension, ...value })).sort((a, b) => b.bytes - a.bytes).slice(0, 200),
      byAge: AGE_BUCKETS.map((age, index) => ({ ...age, ...this.ages[index] })),
    };
  }
}

function depthOf(path: string): number {
  if (!path) return 0;
  let depth = 1;
  for (let index = 0; index < path.length; index++) if (path.charCodeAt(index) === 47) depth++;
  return depth;
}

/**
 * Keeps every folder in the top three levels and every folder holding at least 1/20000 of the
 * total; smaller ones are folded into their parent's `hiddenDirs`/`hiddenBytes` so the tree still
 * adds up. Capped at `maxNodes` by size.
 */
export function pruneNodes(nodes: readonly SizeNode[], total: number, maxNodes: number): { kept: SizeNode[]; pruned: number } {
  const threshold = total / 20_000;
  let candidates = nodes.filter((node) => depthOf(node.path) <= 3 || node.size >= threshold);
  if (candidates.length > maxNodes) candidates = [...candidates].sort((a, b) => b.size - a.size).slice(0, maxNodes);
  const kept = new Set(candidates.map((node) => node.path));
  // A kept node's parent must be kept too, or the tree breaks.
  for (const node of [...candidates]) {
    let parent = node.path;
    while (parent) {
      parent = parentOf(parent);
      if (kept.has(parent)) break;
      kept.add(parent);
    }
  }
  const byPath = new Map(nodes.map((node) => [node.path, { ...node }]));
  for (const node of nodes) {
    if (kept.has(node.path) || !node.path) continue;
    const parentPath = parentOf(node.path);
    if (!kept.has(parentPath)) continue;
    const parent = byPath.get(parentPath)!;
    byPath.set(parentPath, { ...parent, hiddenDirs: parent.hiddenDirs + 1, hiddenBytes: parent.hiddenBytes + node.size });
  }
  return { kept: [...kept].map((path) => byPath.get(path)!).filter(Boolean), pruned: nodes.length - kept.size };
}
