import { parseRatio, simplifyRatio, solveHeightForRatio, solveWidthForRatio } from "./aspect-ratio.js";

describe('simplifyRatio', () => {
  it('simplifies a common resolution to its lowest terms', () => {
    expect(simplifyRatio(1920, 1080)).toBe('16:9');
  });

  it('leaves an already-simplified ratio unchanged', () => {
    expect(simplifyRatio(4, 3)).toBe('4:3');
  });

  it('handles a square (1:1) ratio', () => {
    expect(simplifyRatio(500, 500)).toBe('1:1');
  });

  it('falls back to the raw values for a zero dimension', () => {
    expect(simplifyRatio(0, 100)).toBe('0:100');
  });
});

describe('solveWidthForRatio / solveHeightForRatio', () => {
  it('solves for width given a height and target ratio', () => {
    expect(solveWidthForRatio(1080, 16, 9)).toBeCloseTo(1920, 5);
  });

  it('solves for height given a width and target ratio', () => {
    expect(solveHeightForRatio(1920, 16, 9)).toBeCloseTo(1080, 5);
  });

  it('returns 0 when the ratio side to divide by is 0', () => {
    expect(solveWidthForRatio(1080, 16, 0)).toBe(0);
    expect(solveHeightForRatio(1920, 0, 9)).toBe(0);
  });
});

describe('parseRatio', () => {
  it('parses a colon-separated ratio', () => {
    expect(parseRatio('16:9')).toEqual({ width: 16, height: 9 });
  });

  it('parses a slash-separated ratio with extra whitespace', () => {
    expect(parseRatio(' 4 / 3 ')).toEqual({ width: 4, height: 3 });
  });

  it('parses decimal ratio values', () => {
    expect(parseRatio('1.85:1')).toEqual({ width: 1.85, height: 1 });
  });

  it('returns null for unparseable input', () => {
    expect(parseRatio('sixteen by nine')).toBeNull();
  });
});
