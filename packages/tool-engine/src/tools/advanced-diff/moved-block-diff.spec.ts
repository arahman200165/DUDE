import { DiffHunk } from "./diff-hunks.js";
import { detectMovedBlocks } from "./moved-block-diff.js";

function hunk(index: number, removedLines: readonly string[], addedLines: readonly string[]): DiffHunk {
  return { index, removedLines, addedLines };
}

describe('detectMovedBlocks', () => {
  it('detects a moved block between a remove-only and an add-only hunk', () => {
    const hunks = [hunk(0, ['line a', 'line b'], []), hunk(1, [], ['line a', 'line b'])];
    const annotations = detectMovedBlocks(hunks);
    expect(annotations.get(0)).toEqual({ movedTo: 1 });
    expect(annotations.get(1)).toEqual({ movedFrom: 0 });
  });

  it('does not flag hunks with different content as moved', () => {
    const hunks = [hunk(0, ['line a', 'line b'], []), hunk(1, [], ['line c', 'line d'])];
    expect(detectMovedBlocks(hunks).size).toBe(0);
  });

  it('does not flag a mixed remove+add hunk (a genuine change, not a move)', () => {
    const hunks = [hunk(0, ['line a', 'line b'], ['line a', 'line b'])];
    expect(detectMovedBlocks(hunks).size).toBe(0);
  });

  it('ignores blocks shorter than minLines to avoid trivial coincidences', () => {
    const hunks = [hunk(0, ['}'], []), hunk(1, [], ['}'])];
    expect(detectMovedBlocks(hunks, 2).size).toBe(0);
  });

  it('respects a custom minLines threshold', () => {
    const hunks = [hunk(0, ['}'], []), hunk(1, [], ['}'])];
    expect(detectMovedBlocks(hunks, 1).size).toBe(2);
  });

  it('does not match the same destination hunk to two different sources', () => {
    const hunks = [
      hunk(0, ['same line', 'x'], []),
      hunk(1, ['same line', 'x'], []),
      hunk(2, [], ['same line', 'x']),
    ];
    const annotations = detectMovedBlocks(hunks);
    // Exactly one of hunk 0/1 matches hunk 2 -- never both.
    const matchedSources = [0, 1].filter((i) => annotations.get(i)?.movedTo === 2);
    expect(matchedSources).toHaveLength(1);
  });

  it('skips detection entirely above the hunk-count cap', () => {
    const many = Array.from({ length: 501 }, (_, i) => hunk(i, [`removed ${i}`, 'x'], []));
    expect(detectMovedBlocks(many).size).toBe(0);
  });

  it('returns an empty map for no hunks', () => {
    expect(detectMovedBlocks([]).size).toBe(0);
  });
});
