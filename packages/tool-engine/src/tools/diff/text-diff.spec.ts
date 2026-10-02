import { computeLineDiff } from "./text-diff.js";

describe('computeLineDiff', () => {
  it('reports every line as equal for identical text', () => {
    const result = computeLineDiff('a\nb\nc', 'a\nb\nc');

    expect(result.summary).toEqual({ added: 0, removed: 0, unchanged: 3 });
    expect(result.lines.every((line) => line.type === 'equal')).toBe(true);
  });

  it('reports an added line at the end', () => {
    const result = computeLineDiff('a\nb', 'a\nb\nc');

    expect(result.summary).toEqual({ added: 1, removed: 0, unchanged: 2 });
    expect(result.lines.at(-1)).toEqual({ type: 'add', text: 'c' });
  });

  it('reports a removed line from the middle', () => {
    const result = computeLineDiff('a\nb\nc', 'a\nc');

    expect(result.summary).toEqual({ added: 0, removed: 1, unchanged: 2 });
    expect(result.lines.some((line) => line.type === 'remove' && line.text === 'b')).toBe(true);
  });

  it('treats a changed line as a remove + add pair', () => {
    const result = computeLineDiff('hello world', 'hello there');

    expect(result.summary.removed).toBe(1);
    expect(result.summary.added).toBe(1);
  });

  it('handles empty input on both sides', () => {
    expect(computeLineDiff('', '')).toEqual({ lines: [], summary: { added: 0, removed: 0, unchanged: 0 } });
  });

  it('treats entirely new content as all-added when the left side is empty', () => {
    const result = computeLineDiff('', 'a\nb');

    expect(result.summary).toEqual({ added: 2, removed: 0, unchanged: 0 });
  });

  it('does not misreport a shared final line as changed when only one side has a trailing newline', () => {
    const result = computeLineDiff('a\nb\n', 'a\nb');

    expect(result.summary).toEqual({ added: 0, removed: 0, unchanged: 2 });
    expect(result.lines.every((line) => line.type === 'equal')).toBe(true);
  });
});
