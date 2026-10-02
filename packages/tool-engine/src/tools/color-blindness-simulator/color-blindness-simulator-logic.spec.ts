import { simulateColorBlindness } from "./color-blindness-simulator-logic.js";

describe('simulateColorBlindness', () => {
  it('preserves alpha and array length', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 128]);
    const out = simulateColorBlindness(rgba, 'protanopia');
    expect(out).toHaveLength(4);
    expect(out[3]).toBe(128);
  });

  it('leaves pure black and pure white close to unchanged (matrix rows sum to ~1)', () => {
    const black = simulateColorBlindness(new Uint8ClampedArray([0, 0, 0, 255]), 'deuteranopia');
    expect(black[0]).toBe(0);
    expect(black[1]).toBe(0);
    expect(black[2]).toBe(0);

    const white = simulateColorBlindness(new Uint8ClampedArray([255, 255, 255, 255]), 'tritanopia');
    expect(white[0]).toBeGreaterThan(240);
    expect(white[1]).toBeGreaterThan(240);
    expect(white[2]).toBeGreaterThan(240);
  });

  it('applies distinct transforms per deficiency type', () => {
    const rgba = new Uint8ClampedArray([200, 50, 50, 255]);
    const pro = simulateColorBlindness(rgba, 'protanopia');
    const deu = simulateColorBlindness(rgba, 'deuteranopia');
    const tri = simulateColorBlindness(rgba, 'tritanopia');
    expect([...pro]).not.toEqual([...deu]);
    expect([...deu]).not.toEqual([...tri]);
  });

  it('processes multiple pixels independently', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const out = simulateColorBlindness(rgba, 'protanopia');
    expect(out).toHaveLength(8);
  });
});
