import { findDuplicateLines, findDuplicateWords, removeDuplicateLines } from "./duplicate-finder-logic.js";

describe('findDuplicateLines', () => {
  it('finds lines that occur more than once', () => {
    const result = findDuplicateLines('a\nb\na\nc\nb\na', true);
    expect(result).toEqual([
      { value: 'a', count: 3, firstLineNumber: 1 },
      { value: 'b', count: 2, firstLineNumber: 2 },
    ]);
  });

  it('ignores blank lines', () => {
    expect(findDuplicateLines('a\n\n\nb', true)).toEqual([]);
  });

  it('is case-sensitive by default when requested', () => {
    expect(findDuplicateLines('Foo\nfoo', true)).toEqual([]);
  });

  it('folds case when case-sensitive is false', () => {
    const result = findDuplicateLines('Foo\nfoo', false);
    expect(result).toEqual([{ value: 'Foo', count: 2, firstLineNumber: 1 }]);
  });

  it('returns nothing when every line is unique', () => {
    expect(findDuplicateLines('a\nb\nc', true)).toEqual([]);
  });
});

describe('removeDuplicateLines', () => {
  it('keeps only the first occurrence of each line', () => {
    expect(removeDuplicateLines('a\nb\na\nc\nb', true)).toBe('a\nb\nc');
  });

  it('preserves blank lines', () => {
    expect(removeDuplicateLines('a\n\na', true)).toBe('a\n');
  });

  it('respects case sensitivity', () => {
    expect(removeDuplicateLines('Foo\nfoo', false)).toBe('Foo');
    expect(removeDuplicateLines('Foo\nfoo', true)).toBe('Foo\nfoo');
  });
});

describe('findDuplicateWords', () => {
  it('finds words that occur more than once across the text', () => {
    const result = findDuplicateWords('the quick fox the lazy fox', true);
    expect(result).toEqual([
      { value: 'the', count: 2, firstLineNumber: 1 },
      { value: 'fox', count: 2, firstLineNumber: 1 },
    ]);
  });

  it('folds case when requested', () => {
    const result = findDuplicateWords('The the', false);
    expect(result).toEqual([{ value: 'The', count: 2, firstLineNumber: 1 }]);
  });

  it('keeps apostrophes and hyphens as part of a word', () => {
    const result = findDuplicateWords("don't don't well-known well-known", true);
    expect(result.map((r) => r.value)).toEqual(["don't", 'well-known']);
  });

  it('returns nothing for text with no repeated words', () => {
    expect(findDuplicateWords('one two three', true)).toEqual([]);
  });
});
