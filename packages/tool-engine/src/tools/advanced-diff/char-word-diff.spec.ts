import { computeCharDiff, computeWordDiff, tokenizeWords } from "./char-word-diff.js";

describe('tokenizeWords', () => {
  it('splits into alternating word/whitespace runs that reconstruct the original text', () => {
    const text = 'the quick  brown\nfox';
    const tokens = tokenizeWords(text);
    expect(tokens.join('')).toBe(text);
    expect(tokens).toEqual(['the', ' ', 'quick', '  ', 'brown', '\n', 'fox']);
  });

  it('returns an empty array for an empty string', () => {
    expect(tokenizeWords('')).toEqual([]);
  });
});

describe('computeCharDiff', () => {
  it('reports no differences for identical strings', () => {
    const result = computeCharDiff('hello', 'hello');
    expect(result.segments).toEqual([{ type: 'equal', text: 'hello' }]);
    expect(result.summary).toEqual({ addedChars: 0, removedChars: 0 });
  });

  it('detects a single-character substitution at char granularity', () => {
    const result = computeCharDiff('cat', 'car');
    const reconstructedLeft = result.segments
      .filter((s) => s.type !== 'add')
      .map((s) => s.text)
      .join('');
    const reconstructedRight = result.segments
      .filter((s) => s.type !== 'remove')
      .map((s) => s.text)
      .join('');
    expect(reconstructedLeft).toBe('cat');
    expect(reconstructedRight).toBe('car');
    expect(result.summary.addedChars).toBeGreaterThan(0);
    expect(result.summary.removedChars).toBeGreaterThan(0);
  });

  it('handles empty inputs', () => {
    expect(computeCharDiff('', '').segments).toEqual([]);
    expect(computeCharDiff('', 'abc').segments).toEqual([{ type: 'add', text: 'abc' }]);
  });
});

describe('computeWordDiff', () => {
  it('reports no differences for identical strings', () => {
    const result = computeWordDiff('the quick fox', 'the quick fox');
    expect(result.segments.every((s) => s.type === 'equal')).toBe(true);
  });

  it('isolates a single changed word rather than the whole sentence', () => {
    const result = computeWordDiff('the quick brown fox', 'the slow brown fox');

    const removed = result.segments.filter((s) => s.type === 'remove').map((s) => s.text);
    const added = result.segments.filter((s) => s.type === 'add').map((s) => s.text);

    expect(removed).toEqual(['quick']);
    expect(added).toEqual(['slow']);
  });

  it('round-trips: concatenating the non-add segments reproduces the left text, non-remove segments reproduce the right', () => {
    const left = 'the quick brown fox';
    const right = 'the slow brown fox jumps';
    const result = computeWordDiff(left, right);

    const reconstructedLeft = result.segments
      .filter((s) => s.type !== 'add')
      .map((s) => s.text)
      .join('');
    const reconstructedRight = result.segments
      .filter((s) => s.type !== 'remove')
      .map((s) => s.text)
      .join('');

    expect(reconstructedLeft).toBe(left);
    expect(reconstructedRight).toBe(right);
  });

  it('handles empty inputs', () => {
    expect(computeWordDiff('', '').segments).toEqual([]);
  });
});
