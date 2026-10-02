import { describe, expect, it } from 'vitest';
import { computeResizedDimensions } from "./resize-dimensions.js";

describe('computeResizedDimensions', () => {
  it('returns 0x0 for a non-positive original size', () => {
    expect(computeResizedDimensions({ originalWidth: 0, originalHeight: 100, mode: 'percent', percent: 50, lockAspect: true })).toEqual({
      width: 0,
      height: 0,
    });
  });

  it('scales by percentage', () => {
    expect(
      computeResizedDimensions({ originalWidth: 200, originalHeight: 100, mode: 'percent', percent: 50, lockAspect: true }),
    ).toEqual({ width: 100, height: 50 });
  });

  it('clamps percent to a minimum of 1', () => {
    expect(
      computeResizedDimensions({ originalWidth: 200, originalHeight: 100, mode: 'percent', percent: -50, lockAspect: true }),
    ).toEqual({ width: 2, height: 1 });
  });

  it('derives height from width when aspect is locked and only width is given', () => {
    expect(
      computeResizedDimensions({ originalWidth: 200, originalHeight: 100, mode: 'dimensions', targetWidth: 400, lockAspect: true }),
    ).toEqual({ width: 400, height: 200 });
  });

  it('derives width from height when aspect is locked and only height is given', () => {
    expect(
      computeResizedDimensions({ originalWidth: 200, originalHeight: 100, mode: 'dimensions', targetHeight: 50, lockAspect: true }),
    ).toEqual({ width: 100, height: 50 });
  });

  it('allows independent width/height when aspect is unlocked', () => {
    expect(
      computeResizedDimensions({
        originalWidth: 200,
        originalHeight: 100,
        mode: 'dimensions',
        targetWidth: 300,
        targetHeight: 300,
        lockAspect: false,
      }),
    ).toEqual({ width: 300, height: 300 });
  });
});
