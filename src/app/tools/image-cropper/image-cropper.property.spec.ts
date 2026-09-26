import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from '../../../testing/property-harness';
import { clampCropRect, rectFromPoints, scaleRectToNatural, type CropRect, type Point } from './crop-rect';

const pointArb: fc.Arbitrary<Point> = fc.record({
  x: fc.double({ noNaN: true, min: -10_000, max: 10_000 }),
  y: fc.double({ noNaN: true, min: -10_000, max: 10_000 }),
});
const rectArb: fc.Arbitrary<CropRect> = fc.record({
  x: fc.double({ noNaN: true, min: -10_000, max: 10_000 }),
  y: fc.double({ noNaN: true, min: -10_000, max: 10_000 }),
  width: fc.double({ noNaN: true, min: -10_000, max: 10_000 }),
  height: fc.double({ noNaN: true, min: -10_000, max: 10_000 }),
});
const positiveDimArb = fc.double({ noNaN: true, min: 0.01, max: 10_000 });
const nonNegativeDimArb = fc.double({ noNaN: true, min: 0, max: 10_000 });

describe('rectFromPoints property tests', () => {
  it('never throws and always returns a non-negative-size rect', () => {
    neverThrows(([a, b]: readonly [Point, Point]) => rectFromPoints(a, b), fc.tuple(pointArb, pointArb), {
      assertShape: (result) => {
        const r = result as CropRect;
        if (r.width < 0 || r.height < 0) throw new Error('expected non-negative width/height');
      },
    });
  });

  it('is symmetric: swapping the two points gives the same rect', () => {
    invariant(
      ([a, b]: readonly [Point, Point]) => [rectFromPoints(a, b), rectFromPoints(b, a)] as const,
      fc.tuple(pointArb, pointArb),
      ([r1, r2]) => r1.x === r2.x && r1.y === r2.y && r1.width === r2.width && r1.height === r2.height,
    );
  });
});

describe('scaleRectToNatural property tests', () => {
  const inputArb = fc.record({
    rect: rectArb,
    displayedWidth: nonNegativeDimArb,
    displayedHeight: nonNegativeDimArb,
    naturalWidth: positiveDimArb,
    naturalHeight: positiveDimArb,
  });

  it('never throws for arbitrary rects/dimensions', () => {
    neverThrows(
      (i: { rect: CropRect; displayedWidth: number; displayedHeight: number; naturalWidth: number; naturalHeight: number }) =>
        scaleRectToNatural(i.rect, i.displayedWidth, i.displayedHeight, i.naturalWidth, i.naturalHeight),
      inputArb,
    );
  });

  it('returns an all-zero rect for a degenerate (zero) displayed size', () => {
    invariant(
      (i: { rect: CropRect; naturalWidth: number; naturalHeight: number }) => scaleRectToNatural(i.rect, 0, 0, i.naturalWidth, i.naturalHeight),
      fc.record({ rect: rectArb, naturalWidth: positiveDimArb, naturalHeight: positiveDimArb }),
      (result) => result.x === 0 && result.y === 0 && result.width === 0 && result.height === 0,
    );
  });
});

describe('clampCropRect property tests', () => {
  const inputArb = fc.record({ rect: rectArb, imageWidth: positiveDimArb, imageHeight: positiveDimArb });

  it('never throws for arbitrary rects/image sizes', () => {
    neverThrows((i: { rect: CropRect; imageWidth: number; imageHeight: number }) => clampCropRect(i.rect, i.imageWidth, i.imageHeight), inputArb);
  });

  it('always stays within the image bounds', () => {
    invariant(
      (i: { rect: CropRect; imageWidth: number; imageHeight: number }) => clampCropRect(i.rect, i.imageWidth, i.imageHeight),
      inputArb,
      // Each of x/y/width/height is independently rounded to the nearest integer, so the summed
      // bound can drift by up to 1 unit from the exact (pre-rounding) imageWidth/imageHeight.
      (result, { imageWidth, imageHeight }) =>
        result.x >= 0 &&
        result.y >= 0 &&
        result.width >= 0 &&
        result.height >= 0 &&
        result.x + result.width <= imageWidth + 1 + 1e-9 &&
        result.y + result.height <= imageHeight + 1 + 1e-9,
    );
  });

  it('is idempotent: clamping an already-clamped rect is a no-op', () => {
    invariant(
      (i: { rect: CropRect; imageWidth: number; imageHeight: number }) => {
        const once = clampCropRect(i.rect, i.imageWidth, i.imageHeight);
        return [once, clampCropRect(once, i.imageWidth, i.imageHeight)] as const;
      },
      inputArb,
      ([once, twice]) => once.x === twice.x && once.y === twice.y && once.width === twice.width && once.height === twice.height,
    );
  });
});
