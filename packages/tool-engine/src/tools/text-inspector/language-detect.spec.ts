import { detectLanguage, MIN_DETECTION_LENGTH } from "./language-detect.js";

describe('detectLanguage', () => {
  it('returns no guesses for text shorter than the minimum length', () => {
    expect(detectLanguage('hi')).toEqual([]);
    expect('hi'.length).toBeLessThan(MIN_DETECTION_LENGTH);
  });

  it('returns no guesses for empty input', () => {
    expect(detectLanguage('')).toEqual([]);
  });

  it('detects English text', () => {
    const guesses = detectLanguage('This is a reasonably long sentence written in plain English for testing purposes.');
    expect(guesses[0]?.code).toBe('eng');
    expect(guesses[0]?.name).toBe('English');
  });

  it('detects French text', () => {
    const guesses = detectLanguage(
      'Ceci est une phrase suffisamment longue écrite en français pour tester la détection de la langue.',
    );
    expect(guesses[0]?.code).toBe('fra');
  });

  it('orders guesses by descending score', () => {
    const guesses = detectLanguage('This is a reasonably long sentence written in plain English for testing purposes.');
    for (let i = 1; i < guesses.length; i++) {
      expect(guesses[i].score).toBeLessThanOrEqual(guesses[i - 1].score);
    }
  });

  it('excludes the "undetermined" pseudo-language from results', () => {
    const guesses = detectLanguage('This is a reasonably long sentence written in plain English for testing purposes.');
    expect(guesses.some((g) => g.code === 'und')).toBe(false);
  });
});
