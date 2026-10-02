import { compareStrings } from "./string-similarity.js";

describe('compareStrings', () => {
  it('returns zero distance and perfect similarity for identical strings', () => {
    const result = compareStrings('hello', 'hello');
    expect(result.levenshteinDistance).toBe(0);
    expect(result.levenshteinSimilarity).toBe(1);
    expect(result.jaroWinklerSimilarity).toBe(1);
  });

  it('computes the classic kitten/sitting Levenshtein distance', () => {
    expect(compareStrings('kitten', 'sitting').levenshteinDistance).toBe(3);
  });

  it('matches the standard MARTHA/MARHTA Jaro-Winkler reference value', () => {
    const result = compareStrings('MARTHA', 'MARHTA');
    expect(result.jaroWinklerSimilarity).toBeCloseTo(0.9611, 4);
  });

  it('matches the standard DIXON/DICKSONX Jaro-Winkler reference value', () => {
    const result = compareStrings('DIXON', 'DICKSONX');
    expect(result.jaroWinklerSimilarity).toBeCloseTo(0.8133, 4);
  });

  it('matches the standard DWAYNE/DUANE Jaro-Winkler reference value', () => {
    const result = compareStrings('DWAYNE', 'DUANE');
    expect(result.jaroWinklerSimilarity).toBeCloseTo(0.84, 4);
  });

  it('returns zero similarity for two completely different strings of equal length', () => {
    const result = compareStrings('abc', 'xyz');
    expect(result.jaroWinklerSimilarity).toBe(0);
  });

  it('handles one empty string', () => {
    const result = compareStrings('', 'abc');
    expect(result.levenshteinDistance).toBe(3);
    expect(result.levenshteinSimilarity).toBe(0);
    expect(result.jaroWinklerSimilarity).toBe(0);
  });

  it('handles two empty strings', () => {
    const result = compareStrings('', '');
    expect(result.levenshteinDistance).toBe(0);
    expect(result.levenshteinSimilarity).toBe(1);
    expect(result.jaroWinklerSimilarity).toBe(1);
  });
});
