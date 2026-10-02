import { generatePalette } from "./palette-generator-logic.js";

describe('generatePalette', () => {
  it('rejects an empty base color', () => {
    expect(generatePalette('', 'complementary')).toEqual({
      ok: false,
      error: 'Enter a base color to generate a palette.',
    });
  });

  it('rejects an unrecognized base color', () => {
    expect(generatePalette('not-a-color', 'complementary')).toEqual({
      ok: false,
      error: 'Could not recognize this as a color.',
    });
  });

  it('generates a 2-color complementary palette 180deg apart', () => {
    const result = generatePalette('#ff0000', 'complementary');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.colors).toHaveLength(2);
    expect(result.colors[0]).toBe('#ff0000');
    expect(result.colors[1]).toBe('#00ffff');
  });

  it('generates a 3-color triadic palette', () => {
    const result = generatePalette('#ff0000', 'triadic');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.colors).toHaveLength(3);
  });

  it('generates a 4-color tetradic palette', () => {
    const result = generatePalette('#3b82f6', 'tetradic');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.colors).toHaveLength(4);
  });

  it('generates a 5-step monochromatic ramp including the base color', () => {
    const result = generatePalette('#3b82f6', 'monochromatic');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.colors).toHaveLength(5);
    expect(result.colors[2]).toBe('#3b82f6');
  });
});
