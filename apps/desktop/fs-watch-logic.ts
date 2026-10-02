import type { ChangeEvent } from "@dude/contracts/fs/watch-types";

/**
 * Pure event classification for the folder watch service (Phase 29, Milestone 534). `fs.watch` only
 * reports "rename" (appeared/disappeared/renamed) or "change" plus a path, often several times per
 * real change; the service coalesces a short window of raw events per path, stats each path once,
 * and hands the results here to become timeline events. A disappearance and an appearance in the same
 * window with the same size and file name (or same folder) are paired into a rename.
 */

export interface RawObservation {
  readonly path: string;
  /** Size/mtime now, or null when the path no longer exists. */
  readonly now: { readonly size: number; readonly mtimeMs: number; readonly isDir: boolean } | null;
  /** What the service last knew about the path, if anything. */
  readonly known: { readonly size: number; readonly mtimeMs: number; readonly isDir: boolean } | null;
  /** fs.watch reported a "rename" (vs only "change") for this path during the window. */
  readonly renamed: boolean;
}

export type Classified = Omit<ChangeEvent, 'seq' | 'at'>;

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

export function classify(observations: readonly RawObservation[]): Classified[] {
  const created: RawObservation[] = [];
  const deleted: RawObservation[] = [];
  const out: Classified[] = [];
  for (const observation of observations) {
    const { now, known } = observation;
    if (!now && (known || observation.renamed)) deleted.push(observation);
    else if (now && !known && observation.renamed) created.push(observation);
    else if (now && !now.isDir && (!known || known.size !== now.size || Math.abs(known.mtimeMs - now.mtimeMs) >= 2)) {
      out.push({ kind: 'modified', path: observation.path, size: now.size, ...(known ? { sizeDelta: now.size - known.size } : {}) });
    }
  }
  const pairedCreates = new Set<RawObservation>();
  for (const gone of deleted) {
    let partner = created.find((item) => !pairedCreates.has(item) && gone.known && item.now && item.now.size === gone.known.size && item.now.isDir === gone.known.isDir
      && (nameOf(item.path) === nameOf(gone.path) || folderOf(item.path) === folderOf(gone.path)));
    if (!partner && !gone.known) {
      // Never seen before, so its size is unknown: pair only when this is the one disappearance and
      // the one unpaired appearance in its folder during the window (Windows reports a rename as
      // exactly that pair).
      const folder = folderOf(gone.path);
      const unknownGone = deleted.filter((item) => !item.known && folderOf(item.path) === folder);
      const candidates = created.filter((item) => !pairedCreates.has(item) && folderOf(item.path) === folder);
      if (unknownGone.length === 1 && candidates.length === 1) partner = candidates[0];
    }
    if (partner) {
      pairedCreates.add(partner);
      out.push({ kind: 'renamed', path: partner.path, from: gone.path, size: partner.now!.size, ...(partner.now!.isDir ? { isDir: true } : {}) });
    } else out.push({ kind: 'deleted', path: gone.path, ...(gone.known ? { size: gone.known.size, sizeDelta: -gone.known.size } : {}), ...(gone.known?.isDir ? { isDir: true } : {}) });
  }
  for (const item of created) if (!pairedCreates.has(item)) out.push({ kind: 'created', path: item.path, size: item.now!.size, ...(item.now!.isDir ? { isDir: true } : {}) });
  return out;
}

/** Whether a folder-relative posix path falls under an excluded name/glob or a DUDE temp file. */
export function isNoise(path: string, excluded: (path: string, name: string) => boolean): boolean {
  const parts = path.split('/');
  if (/^\.dude-(tmp|rn)-/.test(parts[parts.length - 1])) return true;
  for (let index = 0; index < parts.length; index++) if (excluded(parts.slice(0, index + 1).join('/'), parts[index])) return true;
  return false;
}

/** Rate-limited notification decision: at most one per folder per window, summarizing the rest. */
export function shouldNotify(lastNotifiedAt: number | undefined, now: number, everyMinutes: number): boolean {
  return lastNotifiedAt === undefined || now - lastNotifiedAt >= everyMinutes * 60_000;
}

export function summarize(events: readonly Classified[]): string {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => `${count} ${kind}`).join(', ');
}
