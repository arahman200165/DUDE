import type { JournalEntry } from '../../../shared-logic/fs/fs-types';
import { describeOp, filterJournal, summarizeEntry } from './batch-operations-logic';

const entry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  planId: 'p', title: 'Rename photos', tool: 'batch-rename', root: 'C:\pics', appliedAt: '2026-01-01T00:00:00Z',
  ops: [{ kind: 'rename', path: 'a.jpg', to: 'b.jpg', outcome: 'applied' }, { kind: 'write', path: 'x.txt', outcome: 'conflict' }],
  backupBytes: 0, backupsPruned: false, noUndo: false, ...overrides,
});

describe('batch operations logic', () => {
  it('counts outcomes and marks reversible entries undoable', () => {
    expect(summarizeEntry(entry())).toEqual({ counts: { applied: 1, conflict: 1, failed: 0, cancelled: 0, pending: 0 }, undoable: true, undoNote: '' });
  });

  it('explains why an entry cannot be undone', () => {
    expect(summarizeEntry(entry({ undoneBy: 'q' })).undoNote).toBe('Already undone');
    expect(summarizeEntry(entry({ ops: [{ kind: 'trash', path: 'a', outcome: 'applied' }] })).undoNote).toMatch(/Recycle Bin/);
    expect(summarizeEntry(entry({ ops: [{ kind: 'write', path: 'a', outcome: 'applied' }], backupsPruned: true })).undoNote).toBe('Backups were pruned');
    expect(summarizeEntry(entry({ ops: [{ kind: 'write', path: 'a', outcome: 'applied' }], noUndo: true })).undoNote).toBe('Applied without backups');
    expect(summarizeEntry(entry({ ops: [{ kind: 'write', path: 'a', outcome: 'failed' }] })).undoNote).toBe('Nothing was applied');
  });

  it('describes ops and filters entries', () => {
    expect(describeOp({ kind: 'rename', path: 'a', to: 'b', outcome: 'applied' })).toBe('Renamed a → b');
    expect(describeOp({ kind: 'trash', path: 'a', outcome: 'applied' })).toBe('Moved to Recycle Bin a');
    expect(filterJournal([entry(), entry({ title: 'Convert', tool: 'batch-text-converter' })], 'convert')).toHaveLength(1);
  });
});
