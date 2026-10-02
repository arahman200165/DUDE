import { detectFeatures } from "./regex-ast-features.js";

describe('detectFeatures', () => {
  it('detects a named capturing group', () => {
    expect(detectFeatures('(?<year>\\d{4})', '').hasNamedGroups).toBe(true);
  });

  it('detects lookahead', () => {
    expect(detectFeatures('foo(?=bar)', '').hasLookahead).toBe(true);
  });

  it('detects lookbehind', () => {
    expect(detectFeatures('(?<=foo)bar', '').hasLookbehind).toBe(true);
  });

  it('detects a backreference', () => {
    expect(detectFeatures('(a)\\1', '').hasBackreference).toBe(true);
  });

  it('reports no features for a simple pattern', () => {
    expect(detectFeatures('abc', '')).toEqual({
      hasNamedGroups: false,
      hasLookbehind: false,
      hasLookahead: false,
      hasBackreference: false,
    });
  });

  it('falls back to presence checks when the pattern fails to parse', () => {
    expect(() => detectFeatures('(unclosed', '')).not.toThrow();
  });
});
