import type { SysJournalEntry, SysSnapshotHeader } from '../../../shared-logic/system/sys-mutation-types';
import { countOutcomes, distinctTools, filterJournal, formatBytes, groupSnapshots, isUndoable, snapshotFileName, undoNote } from './system-changes-logic';

const entry = (overrides: Partial<SysJournalEntry> = {}): SysJournalEntry => ({
  planId: 'p', title: 'Set FOO', tool: 'env-editor', appliedAt: '2026-01-01T00:00:00Z', elevated: false,
  ops: [
    { kind: 'env.set', target: 'HKCU\\Environment\\FOO', summary: 's', outcome: 'applied', noUndo: false, undo: { kind: 'env.set', params: {} } },
    { kind: 'env.set', target: 'BAR', summary: 's', outcome: 'conflict', noUndo: false },
  ],
  backupBytes: 0, backupsPruned: false, ...overrides,
});

describe('system changes logic', () => {
  it('counts outcomes', () => {
    expect(countOutcomes(entry())).toEqual({ applied: 1, conflict: 1, failed: 0, cancelled: 0 });
  });

  it('decides undoability with a reason', () => {
    expect(isUndoable(entry())).toBe(true);
    expect(isUndoable(entry({ undoneBy: 'q' }))).toBe(false);
    expect(undoNote(entry({ undoneBy: 'q' }))).toBe('Already undone');
    const killed = entry({ ops: [{ kind: 'process.kill', target: 'x', summary: 's', outcome: 'applied', noUndo: true }] });
    expect(isUndoable(killed)).toBe(false);
    expect(undoNote(killed)).toBe('Cannot be undone');
    expect(undoNote(entry({ ops: [{ kind: 'k', target: 'x', summary: 's', outcome: 'failed', noUndo: false }] }))).toBe('Nothing was applied');
  });

  it('filters by tool, outcome and text, newest first', () => {
    const older = entry({ planId: 'a', appliedAt: '2025-01-01T00:00:00Z' });
    const other = entry({ planId: 'b', tool: 'registry-editor', title: 'Edit key' });
    const all = [older, entry({ planId: 'c' }), other];
    expect(filterJournal(all).map((e) => e.planId)).toEqual(['c', 'b', 'a']);
    expect(filterJournal(all, { tool: 'registry-editor' })).toHaveLength(1);
    expect(filterJournal(all, { outcome: 'failed' })).toHaveLength(0);
    expect(filterJournal(all, { outcome: 'conflict' })).toHaveLength(3);
    expect(filterJournal(all, { query: 'edit key' })).toHaveLength(1);
    expect(filterJournal(all, { query: 'hkcu' })).toHaveLength(3);
    expect(distinctTools(all)).toEqual(['env-editor', 'registry-editor']);
  });

  it('groups snapshots by kind, newest first', () => {
    const header = (id: string, kind: SysSnapshotHeader['kind'], createdAt: string): SysSnapshotHeader => ({ id, kind, name: id, source: 's', createdAt, bytes: 1 });
    const groups = groupSnapshots([header('a', 'path', '2026-01-01'), header('b', 'env', '2026-01-01'), header('c', 'path', '2026-02-01')]);
    expect(groups.map((g) => g.kind)).toEqual(['env', 'path']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['c', 'a']);
  });

  it('formats bytes and file names', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 KiB');
    expect(snapshotFileName({ kind: 'env', name: 'Before  upgrade!' })).toBe('env-Before-upgrade.json');
  });
});
