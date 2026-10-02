import { describe, expect, it } from 'vitest';
import { clampCropRect, rectFromPoints, scaleRectToNatural } from "./crop-rect.js";

describe('rectFromPoints', () => {
  it('normalizes a rect regardless of drag direction', () => {
    expect(rectFromPoints({ x: 50, y: 50 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 40, height: 30 });
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 50, y: 50 })).toEqual({ x: 10, y: 20, width: 40, height: 30 });
  });
});

describe('scaleRectToNatural', () => {
  it('scales a displayed-space rect up to natural pixels', () => {
    const rect = { x: 10, y: 10, width: 50, height: 25 };
    // Displayed at half the natural size.
    expect(scaleRectToNatural(rect, 100, 50, 200, 100)).toEqual({ x: 20, y: 20, width: 100, height: 50 });
  });

  it('returns a zero rect when the displayed size is degenerate', () => {
    expect(scaleRectToNatural({ x: 0, y: 0, width: 10, height: 10 }, 0, 0, 200, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('clampCropRect', () => {
  it('leaves an in-bounds rect unchanged', () => {
    expect(clampCropRect({ x: 10, y: 10, width: 50, height: 50 }, 200, 200)).toEqual({ x: 10, y: 10, width: 50, height: 50 });
  });

  it('clamps a rect that extends past the image bounds', () => {
    expect(clampCropRect({ x: 150, y: 150, width: 100, height: 100 }, 200, 200)).toEqual({ x: 150, y: 150, width: 50, height: 50 });
  });

  it('clamps negative origins into bounds', () => {
    expect(clampCropRect({ x: -20, y: -20, width: 50, height: 50 }, 200, 200)).toEqual({ x: 0, y: 0, width: 50, height: 50 });
  });
});
