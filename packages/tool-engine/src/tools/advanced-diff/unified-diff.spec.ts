import { DiffLine } from "../diff/text-diff.js";
import { formatUnifiedDiff } from "./unified-diff.js";

describe('formatUnifiedDiff', () => {
  it('returns an empty string when there are no changes', () => {
    const lines: readonly DiffLine[] = [
      { type: 'equal', text: 'a' },
      { type: 'equal', text: 'b' },
    ];
    expect(formatUnifiedDiff(lines)).toBe('');
  });

  it('formats a single-hunk change with default 3-line context', () => {
    const lines: readonly DiffLine[] = [
      { type: 'equal', text: 'a' },
      { type: 'equal', text: 'b' },
      { type: 'equal', text: 'c' },
      { type: 'equal', text: 'd' },
      { type: 'equal', text: 'e' },
      { type: 'remove', text: 'f' },
      { type: 'add', text: 'F' },
      { type: 'equal', text: 'g' },
      { type: 'equal', text: 'h' },
      { type: 'equal', text: 'i' },
      { type: 'equal', text: 'j' },
      { type: 'equal', text: 'k' },
    ];

    const expected = [
      '--- a',
      '+++ b',
      '@@ -3,7 +3,7 @@',
      ' c',
      ' d',
      ' e',
      '-f',
      '+F',
      ' g',
      ' h',
      ' i',
    ].join('\n');

    expect(formatUnifiedDiff(lines)).toBe(expected);
  });

  it('splits well-separated changes into multiple hunks with correct line numbers', () => {
    const lines: readonly DiffLine[] = [
      { type: 'equal', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'add', text: 'B' },
      { type: 'equal', text: 'c' },
      { type: 'equal', text: 'd' },
      { type: 'equal', text: 'e' },
      { type: 'equal', text: 'f' },
      { type: 'remove', text: 'g' },
      { type: 'add', text: 'G' },
      { type: 'equal', text: 'h' },
    ];

    const expected = [
      '--- a',
      '+++ b',
      '@@ -1,3 +1,3 @@',
      ' a',
      '-b',
      '+B',
      ' c',
      '@@ -6,3 +6,3 @@',
      ' f',
      '-g',
      '+G',
      ' h',
    ].join('\n');

    expect(formatUnifiedDiff(lines, { context: 1 })).toBe(expected);
  });

  it('does not underflow context at the start of the file', () => {
    const lines: readonly DiffLine[] = [
      { type: 'remove', text: 'x' },
      { type: 'add', text: 'X' },
      { type: 'equal', text: 'a' },
      { type: 'equal', text: 'b' },
      { type: 'equal', text: 'c' },
      { type: 'equal', text: 'd' },
      { type: 'equal', text: 'e' },
    ];

    const expected = ['--- a', '+++ b', '@@ -1,4 +1,4 @@', '-x', '+X', ' a', ' b', ' c'].join('\n');

    expect(formatUnifiedDiff(lines)).toBe(expected);
  });

  it('appends a no-newline marker when the right side lacks a trailing newline', () => {
    const lines: readonly DiffLine[] = [
      { type: 'equal', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'add', text: 'B' },
    ];

    const expected = ['--- a', '+++ b', '@@ -1,2 +1,2 @@', ' a', '-b', '+B', '\\ No newline at end of file'].join(
      '\n',
    );

    expect(formatUnifiedDiff(lines, { rightHasTrailingNewline: false })).toBe(expected);
  });

  it('uses custom labels when provided', () => {
    const lines: readonly DiffLine[] = [
      { type: 'remove', text: 'x' },
      { type: 'add', text: 'X' },
    ];

    const output = formatUnifiedDiff(lines, { leftLabel: 'left.txt', rightLabel: 'right.txt' });
    expect(output.split('\n').slice(0, 2)).toEqual(['--- left.txt', '+++ right.txt']);
  });
});
