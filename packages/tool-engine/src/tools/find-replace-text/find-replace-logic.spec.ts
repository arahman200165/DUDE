import { findReplace } from "./find-replace-logic.js";

const OPTIONS = { caseSensitive: true, wholeWord: false };

describe('findReplace', () => {
  it('replaces every occurrence', () => {
    const result = findReplace('foo bar foo', 'foo', 'baz', OPTIONS);
    expect(result.output).toBe('baz bar baz');
    expect(result.matchCount).toBe(2);
  });

  it('is case-sensitive by default', () => {
    const result = findReplace('Foo foo', 'foo', 'x', OPTIONS);
    expect(result.output).toBe('Foo x');
    expect(result.matchCount).toBe(1);
  });

  it('matches case-insensitively when requested', () => {
    const result = findReplace('Foo foo', 'foo', 'x', { ...OPTIONS, caseSensitive: false });
    expect(result.output).toBe('x x');
    expect(result.matchCount).toBe(2);
  });

  it('matches whole words only when requested', () => {
    const result = findReplace('cat category cat', 'cat', 'dog', { ...OPTIONS, wholeWord: true });
    expect(result.output).toBe('dog category dog');
    expect(result.matchCount).toBe(2);
  });

  it('escapes regex special characters in the search term', () => {
    const result = findReplace('a.b.c', '.', '-', OPTIONS);
    expect(result.output).toBe('a-b-c');
  });

  it('treats a $ in the replacement text as a literal character', () => {
    const result = findReplace('price: X', 'X', '$1 special', OPTIONS);
    expect(result.output).toBe('price: $1 special');
  });

  it('returns the input unchanged when find is empty', () => {
    const result = findReplace('hello', '', 'x', OPTIONS);
    expect(result.output).toBe('hello');
    expect(result.matchCount).toBe(0);
  });

  it('reports zero matches when the term is not found', () => {
    const result = findReplace('hello', 'xyz', 'x', OPTIONS);
    expect(result.matchCount).toBe(0);
    expect(result.output).toBe('hello');
  });
});
