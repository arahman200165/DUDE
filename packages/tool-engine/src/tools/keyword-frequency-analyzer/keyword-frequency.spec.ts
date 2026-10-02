import { computeKeywordFrequency } from "./keyword-frequency.js";

const OPTIONS = { ignoreStopWords: false, minLength: 1, caseSensitive: false };

describe('computeKeywordFrequency', () => {
  it('counts word frequency, sorted descending by count', () => {
    const result = computeKeywordFrequency('the cat sat on the mat the cat ran', OPTIONS);
    expect(result[0]).toEqual({ word: 'the', count: 3 });
    expect(result[1]).toEqual({ word: 'cat', count: 2 });
  });

  it('folds case by default', () => {
    const result = computeKeywordFrequency('The the THE', OPTIONS);
    expect(result).toEqual([{ word: 'the', count: 3 }]);
  });

  it('preserves case when case-sensitive is enabled', () => {
    const result = computeKeywordFrequency('The the', { ...OPTIONS, caseSensitive: true });
    expect(result).toHaveLength(2);
  });

  it('filters out words shorter than minLength', () => {
    const result = computeKeywordFrequency('a an the cat', { ...OPTIONS, minLength: 3 });
    expect(result.map((r) => r.word)).toEqual(['cat', 'the']);
  });

  it('excludes stop words when requested', () => {
    const result = computeKeywordFrequency('the cat and the dog', { ...OPTIONS, ignoreStopWords: true });
    expect(result.map((r) => r.word).sort()).toEqual(['cat', 'dog']);
  });

  it('breaks count ties alphabetically', () => {
    const result = computeKeywordFrequency('zebra apple', OPTIONS);
    expect(result.map((r) => r.word)).toEqual(['apple', 'zebra']);
  });

  it('returns an empty list for text with no words', () => {
    expect(computeKeywordFrequency('...', OPTIONS)).toEqual([]);
    expect(computeKeywordFrequency('', OPTIONS)).toEqual([]);
  });
});
