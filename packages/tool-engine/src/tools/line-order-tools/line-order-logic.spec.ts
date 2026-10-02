import { reverseLines, shuffleLines, sortLines } from "./line-order-logic.js";

describe('sortLines', () => {
  it('sorts ascending', () => {
    expect(sortLines('banana\napple\ncherry', 'asc')).toBe('apple\nbanana\ncherry');
  });

  it('sorts descending', () => {
    expect(sortLines('banana\napple\ncherry', 'desc')).toBe('cherry\nbanana\napple');
  });

  it('sorts naturally, treating embedded numbers numerically', () => {
    expect(sortLines('item10\nitem2\nitem1', 'natural')).toBe('item1\nitem2\nitem10');
  });

  it('sorts by length', () => {
    expect(sortLines('ccc\na\nbb', 'by-length')).toBe('a\nbb\nccc');
  });

  it('handles a single line', () => {
    expect(sortLines('only', 'asc')).toBe('only');
  });
});

describe('reverseLines', () => {
  it('reverses line order', () => {
    expect(reverseLines('a\nb\nc')).toBe('c\nb\na');
  });

  it('handles a single line', () => {
    expect(reverseLines('only')).toBe('only');
  });
});

describe('shuffleLines', () => {
  it('preserves every line, just reordered', () => {
    const input = 'a\nb\nc\nd\ne';
    const result = shuffleLines(input);
    expect(result.split('\n').sort()).toEqual(input.split('\n').sort());
  });

  it('handles a single line without throwing', () => {
    expect(shuffleLines('only')).toBe('only');
  });

  it('handles empty input without throwing', () => {
    expect(() => shuffleLines('')).not.toThrow();
  });
});
