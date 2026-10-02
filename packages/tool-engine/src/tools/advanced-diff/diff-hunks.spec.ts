import { DiffLine } from "../diff/text-diff.js";
import { buildHunks, buildMergedOutput } from "./diff-hunks.js";

const lines: readonly DiffLine[] = [
  { type: 'equal', text: 'one' },
  { type: 'remove', text: 'two' },
  { type: 'add', text: 'TWO' },
  { type: 'add', text: 'TWO-B' },
  { type: 'equal', text: 'three' },
  { type: 'remove', text: 'four' },
  { type: 'equal', text: 'five' },
];

describe('buildHunks', () => {
  it('groups contiguous non-equal runs into hunks', () => {
    const hunks = buildHunks(lines);

    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toEqual({ index: 0, removedLines: ['two'], addedLines: ['TWO', 'TWO-B'] });
    expect(hunks[1]).toEqual({ index: 1, removedLines: ['four'], addedLines: [] });
  });

  it('returns no hunks when every line is equal', () => {
    const allEqual: readonly DiffLine[] = [
      { type: 'equal', text: 'a' },
      { type: 'equal', text: 'b' },
    ];
    expect(buildHunks(allEqual)).toEqual([]);
  });
});

describe('buildMergedOutput', () => {
  const hunks = buildHunks(lines);

  it('uses conflict markers for unresolved hunks', () => {
    const output = buildMergedOutput(lines, hunks, new Map());
    expect(output).toBe(
      ['one', '<<<<<<< left', 'two', '=======', 'TWO', 'TWO-B', '>>>>>>> right', 'three', '<<<<<<< left', 'four', '=======', '>>>>>>> right', 'five'].join('\n'),
    );
  });

  it('resolves a hunk to its left lines when accepted', () => {
    const output = buildMergedOutput(lines, hunks, new Map([[0, 'left']]));
    expect(output).toBe(['one', 'two', 'three', '<<<<<<< left', 'four', '=======', '>>>>>>> right', 'five'].join('\n'));
  });

  it('resolves a hunk to its right lines when accepted', () => {
    const output = buildMergedOutput(lines, hunks, new Map([[0, 'right'], [1, 'left']]));
    expect(output).toBe(['one', 'TWO', 'TWO-B', 'three', 'four', 'five'].join('\n'));
  });

  it('produces the plain right-hand text when every hunk is accepted right and there are no removals-only hunks', () => {
    const simpleLines: readonly DiffLine[] = [
      { type: 'remove', text: 'old' },
      { type: 'add', text: 'new' },
    ];
    const simpleHunks = buildHunks(simpleLines);
    const output = buildMergedOutput(simpleLines, simpleHunks, new Map([[0, 'right']]));
    expect(output).toBe('new');
  });
});
