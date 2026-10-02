import pixelmatch from 'pixelmatch';

export interface RasterImage {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface PixelDiffOptions {
  readonly threshold: number;
}

export interface PixelDiffResult {
  readonly diff: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly diffPixelCount: number;
  readonly totalPixels: number;
  readonly diffPercentage: number;
}

export type PixelDiffOutcome = { readonly ok: true; readonly result: PixelDiffResult } | { readonly ok: false; readonly error: string };

/** Guards against a huge image hanging the worker with no feedback (a single synchronous pixelmatch call has no progress reporting). */
const MAX_PIXELS = 32_000_000;

/**
 * Pure wrapper around `pixelmatch` (anti-aliasing-aware perceptual pixel diffing, chosen over a
 * naive per-pixel threshold to avoid a wall of false positives along every anti-aliased edge).
 * Decoding files to raw RGBA data happens in the worker -- this function only ever sees plain
 * typed arrays, so it's fully unit-testable without a canvas.
 */
export function comparePixelData(left: RasterImage, right: RasterImage, options: PixelDiffOptions): PixelDiffOutcome {
  if (left.width !== right.width || left.height !== right.height) {
    return {
      ok: false,
      error: `Images must be the same size to compare (left is ${left.width}×${left.height}, right is ${right.width}×${right.height}).`,
    };
  }

  const totalPixels = left.width * left.height;
  if (totalPixels > MAX_PIXELS) {
    return {
      ok: false,
      error: `Image is too large to compare (${left.width}×${left.height} exceeds the ${MAX_PIXELS.toLocaleString()}-pixel limit).`,
    };
  }

  const diff = new Uint8ClampedArray(left.data.length);
  const diffPixelCount = pixelmatch(left.data, right.data, diff, left.width, left.height, { threshold: options.threshold });

  return {
    ok: true,
    result: {
      diff,
      width: left.width,
      height: left.height,
      diffPixelCount,
      totalPixels,
      diffPercentage: totalPixels === 0 ? 0 : (diffPixelCount / totalPixels) * 100,
    },
  };
}
