import { generateNGrams, tokenize } from "./text-tokenizer-ngram-logic.js";

describe('tokenize', () => {
  it('splits into word-like and non-word-like tokens', () => {
    const tokens = tokenize('Hello, world!', 'word');
    const words = tokens.filter((t) => t.isWordLike).map((t) => t.text);
    expect(words).toEqual(['Hello', 'world']);
  });

  it('splits into sentences', () => {
    const tokens = tokenize('One. Two! Three?', 'sentence');
    const sentences = tokens.map((t) => t.text.trim()).filter((t) => t !== '');
    expect(sentences).toEqual(['One.', 'Two!', 'Three?']);
  });

  it('handles empty input', () => {
    expect(tokenize('', 'word')).toEqual([]);
  });
});

describe('generateNGrams', () => {
  it('generates word bigrams with counts', () => {
    const result = generateNGrams('the cat sat on the mat', 'word', 2);
    expect(result).toContainEqual({ ngram: 'the cat', count: 1 });
    expect(result).toContainEqual({ ngram: 'on the', count: 1 });
  });

  it('generates character trigrams', () => {
    const result = generateNGrams('abcabc', 'char', 3);
    expect(result).toContainEqual({ ngram: 'abc', count: 2 });
  });

  it('counts a repeated word bigram correctly', () => {
    const result = generateNGrams('a b a b a b', 'word', 2);
    const ab = result.find((r) => r.ngram === 'a b');
    expect(ab?.count).toBe(3);
  });

  it('returns an empty list when there are fewer units than n', () => {
    expect(generateNGrams('one', 'word', 3)).toEqual([]);
  });

  it('clamps a non-positive n to at least 1', () => {
    const result = generateNGrams('abc', 'char', 0);
    expect(result).toContainEqual({ ngram: 'a', count: 1 });
  });
});
