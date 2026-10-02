import type { JournalEntry, JournalOp, OpOutcome } from "@dude/contracts/fs/fs-types";

/** Pure summaries of mutation-journal entries for the Batch Operations list (Phase 29, Milestone 524). */

export interface JournalSummary {
  readonly counts: Readonly<Record<OpOutcome, number>>;
  readonly undoable: boolean;
  readonly undoNote: string;
}

export function summarizeEntry(entry: JournalEntry): JournalSummary {
  const counts: Record<OpOutcome, number> = { applied: 0, conflict: 0, failed: 0, cancelled: 0, pending: 0 };
  for (const op of entry.ops) counts[op.outcome]++;
  const reversible = entry.ops.filter((op) => op.outcome === 'applied' && op.kind !== 'trash');
  const needsBackup = reversible.some((op) => op.kind === 'write');
  let undoNote = '';
  if (entry.undoneBy) undoNote = 'Already undone';
  else if (!counts.applied) undoNote = 'Nothing was applied';
  else if (!reversible.length) undoNote = 'Recycle Bin moves are restored from the Recycle Bin';
  else if (needsBackup && (entry.noUndo || entry.backupsPruned) && reversible.every((op) => op.kind === 'write')) undoNote = entry.noUndo ? 'Applied without backups' : 'Backups were pruned';
  return { counts, undoable: !undoNote, undoNote };
}

export function describeOp(op: JournalOp): string {
  const verb = op.kind === 'rename' ? 'Renamed' : op.kind === 'write' ? 'Modified' : op.kind === 'create' ? 'Created' : 'Moved to Recycle Bin';
  return op.to ? `${verb} ${op.path} → ${op.to}` : `${verb} ${op.path}`;
}

/** Filters by free text across title, tool, and root. */
export function filterJournal(entries: readonly JournalEntry[], query: string): readonly JournalEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) => `${entry.title} ${entry.tool} ${entry.root}`.toLowerCase().includes(needle));
}
