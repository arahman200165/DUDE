import { findClosestTailwindColors } from "./tailwind-color-matcher-logic.js";

describe('findClosestTailwindColors', () => {
  it('matches Tailwind blue-500\'s own hex value to itself as the closest color', () => {
    // colord doesn't parse oklch()/oklab() strings as input (no colord plugin covers OK* spaces,
    // by design -- see color-convert.ts), only well-known formats like hex/rgb/hsl/named. #3b82f6
    // is blue-500's commonly-cited hex approximation.
    const result = findClosestTailwindColors('#3b82f6');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches[0].className).toBe('blue-500');
    expect(result.matches[0].distance).toBeLessThan(0.05);
  });

  it('ranks matches by ascending distance', () => {
    const result = findClosestTailwindColors('#3b82f6');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const distances = result.matches.map((m) => m.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it('respects the requested limit', () => {
    const result = findClosestTailwindColors('#3b82f6', 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches).toHaveLength(3);
  });

  it('matches pure white to a near-white swatch', () => {
    const result = findClosestTailwindColors('#ffffff');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches[0].shade).toBeLessThanOrEqual(100);
  });

  it('rejects an empty input', () => {
    expect(findClosestTailwindColors('')).toEqual({ ok: false, error: 'Enter a color to match.' });
  });

  it('rejects unrecognized input', () => {
    expect(findClosestTailwindColors('not-a-color')).toEqual({
      ok: false,
      error: 'Could not recognize this as a color.',
    });
  });
});
