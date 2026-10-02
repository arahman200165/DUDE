import type { SysJournalEntry, SysOpOutcome, SysSnapshotHeader, SysSnapshotKind } from "@dude/contracts/system/sys-mutation-types";

/** Pure helpers for the System Changes journal and snapshot lists (Phase 31, Milestone 594). */

export type OutcomeCounts = Readonly<Record<SysOpOutcome, number>>;

export function countOutcomes(entry: SysJournalEntry): OutcomeCounts {
  const counts: Record<SysOpOutcome, number> = { applied: 0, conflict: 0, failed: 0, cancelled: 0 };
  for (const op of entry.ops) counts[op.outcome]++;
  return counts;
}

/** An entry can be undone when some applied op recorded an inverse and it has not been undone already. */
export function isUndoable(entry: SysJournalEntry): boolean {
  return !entry.undoneBy && entry.ops.some((op) => op.outcome === 'applied' && !!op.undo);
}

export function undoNote(entry: SysJournalEntry): string {
  if (entry.undoneBy) return 'Already undone';
  if (!entry.ops.some((op) => op.outcome === 'applied')) return 'Nothing was applied';
  if (!entry.ops.some((op) => op.undo)) return 'Cannot be undone';
  return '';
}

export interface JournalFilter {
  readonly tool?: string;
  readonly outcome?: SysOpOutcome | '';
  readonly query?: string;
}

/** Newest first, filtered by tool, by "has at least one op with this outcome", and by free text. */
export function filterJournal(entries: readonly SysJournalEntry[], filter: JournalFilter = {}): readonly SysJournalEntry[] {
  const needle = (filter.query ?? '').trim().toLowerCase();
  return entries
    .filter((entry) => !filter.tool || entry.tool === filter.tool)
    .filter((entry) => !filter.outcome || entry.ops.some((op) => op.outcome === filter.outcome))
    .filter((entry) => !needle || `${entry.title} ${entry.tool} ${entry.ops.map((op) => op.target).join(' ')}`.toLowerCase().includes(needle))
    .slice()
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
}

export function distinctTools(entries: readonly SysJournalEntry[]): readonly string[] {
  return [...new Set(entries.map((entry) => entry.tool))].sort();
}

export function groupSnapshots(headers: readonly SysSnapshotHeader[]): readonly { kind: SysSnapshotKind; items: readonly SysSnapshotHeader[] }[] {
  const groups = new Map<SysSnapshotKind, SysSnapshotHeader[]>();
  for (const header of headers) groups.set(header.kind, [...(groups.get(header.kind) ?? []), header]);
  return [...groups.entries()]
    .map(([kind, items]) => ({ kind, items: items.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

export function snapshotFileName(header: Pick<SysSnapshotHeader, 'kind' | 'name'>): string {
  const safe = header.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'snapshot';
  return `${header.kind}-${safe}.json`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
