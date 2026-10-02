import { megapixels, RESOLUTION_PRESETS } from "./resolution-calculator-logic.js";

describe('megapixels', () => {
  it('computes megapixels for a common resolution', () => {
    expect(megapixels(1920, 1080)).toBeCloseTo(2.0736, 4);
  });

  it('computes megapixels for a 4K resolution', () => {
    expect(megapixels(3840, 2160)).toBeCloseTo(8.2944, 4);
  });

  it('returns 0 for a zero dimension', () => {
    expect(megapixels(0, 1080)).toBe(0);
  });
});

describe('RESOLUTION_PRESETS', () => {
  it('has no duplicate names', () => {
    const names = RESOLUTION_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has positive width and height for every preset', () => {
    for (const preset of RESOLUTION_PRESETS) {
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
    }
  });
});
