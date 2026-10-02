import { computeStats } from "./markdown-stats.js";

describe('computeStats', () => {
  it('returns all zeros for empty text', () => {
    expect(computeStats('')).toEqual({ words: 0, characters: 0, charactersNoSpaces: 0, readingTimeMinutes: 0 });
  });

  it('counts words, characters, and characters-without-spaces', () => {
    const stats = computeStats('the quick brown fox');
    expect(stats.words).toBe(4);
    expect(stats.characters).toBe(19);
    expect(stats.charactersNoSpaces).toBe(16);
  });

  it('does not count repeated/leading/trailing whitespace as extra words', () => {
    expect(computeStats('  the   quick  ').words).toBe(2);
  });

  it('handles unicode text', () => {
    expect(computeStats('café naïve').words).toBe(2);
  });

  it('rounds reading time up to at least one minute for any non-empty text', () => {
    expect(computeStats('one word').readingTimeMinutes).toBe(1);
  });

  it('scales reading time with word count at 200 words per minute', () => {
    const text = new Array(401).fill('word').join(' ');
    expect(computeStats(text).readingTimeMinutes).toBe(3);
  });
});
