import { computeReadability, countSyllables, readingEaseLabel } from "./readability.js";

describe('countSyllables', () => {
  it('counts a single-syllable word', () => {
    expect(countSyllables('cat')).toBe(1);
  });

  it('counts a multi-syllable word', () => {
    expect(countSyllables('banana')).toBe(3);
  });

  it('drops a silent trailing e', () => {
    expect(countSyllables('cake')).toBe(1);
  });

  it('keeps the syllable for a trailing -le', () => {
    expect(countSyllables('table')).toBe(2);
  });

  it('returns at least 1 for any non-empty word', () => {
    expect(countSyllables('a')).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 for input with no letters', () => {
    expect(countSyllables('123')).toBe(0);
  });
});

describe('computeReadability', () => {
  it('returns null for empty input', () => {
    expect(computeReadability('')).toBeNull();
  });

  it('returns null for input with no sentence-ending punctuation and only whitespace', () => {
    expect(computeReadability('   ')).toBeNull();
  });

  it('scores a simple short-sentence text as easy', () => {
    const result = computeReadability('The cat sat. The dog ran.');
    expect(result).not.toBeNull();
    expect(result!.fleschReadingEase).toBeGreaterThan(60);
    expect(result!.sentenceCount).toBe(2);
  });

  it('scores a long, complex sentence as harder than a short simple one', () => {
    const easy = computeReadability('The cat sat.')!;
    const hard = computeReadability(
      'The extraordinarily sophisticated and multifaceted investigation into organizational productivity ' +
        'necessitated comprehensive interdisciplinary collaboration among numerous specialized professionals.',
    )!;
    expect(hard.fleschKincaidGrade).toBeGreaterThan(easy.fleschKincaidGrade);
    expect(hard.fleschReadingEase).toBeLessThan(easy.fleschReadingEase);
  });

  it('counts words and sentences consistently', () => {
    const result = computeReadability('One two three. Four five six seven.')!;
    expect(result.wordCount).toBe(7);
    expect(result.sentenceCount).toBe(2);
  });
});

describe('readingEaseLabel', () => {
  it('labels the standard Flesch Reading Ease buckets', () => {
    expect(readingEaseLabel(95)).toBe('Very Easy');
    expect(readingEaseLabel(85)).toBe('Easy');
    expect(readingEaseLabel(72)).toBe('Fairly Easy');
    expect(readingEaseLabel(65)).toBe('Standard');
    expect(readingEaseLabel(55)).toBe('Fairly Difficult');
    expect(readingEaseLabel(35)).toBe('Difficult');
    expect(readingEaseLabel(10)).toBe('Very Confusing');
  });
});
