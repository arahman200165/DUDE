import { comparePixelData, RasterImage } from "./image-pixel-diff.js";

function solid(width: number, height: number, [r, g, b, a]: readonly [number, number, number, number]): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { data, width, height };
}

describe('comparePixelData', () => {
  it('reports zero differences for identical images', () => {
    const image = solid(2, 2, [255, 0, 0, 255]);
    const result = comparePixelData(image, solid(2, 2, [255, 0, 0, 255]), { threshold: 0.1 });
    expect(result).toEqual({
      ok: true,
      result: expect.objectContaining({ diffPixelCount: 0, totalPixels: 4, diffPercentage: 0 }),
    });
  });

  it('detects every pixel as different between two solid, unrelated colors', () => {
    const result = comparePixelData(solid(2, 2, [255, 0, 0, 255]), solid(2, 2, [0, 0, 255, 255]), { threshold: 0.1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.diffPixelCount).toBe(4);
      expect(result.result.totalPixels).toBe(4);
      expect(result.result.diffPercentage).toBe(100);
      expect(result.result.diff).toHaveLength(2 * 2 * 4);
    }
  });

  it('rejects mismatched image dimensions with a clear error, not a thrown exception', () => {
    const result = comparePixelData(solid(2, 2, [0, 0, 0, 255]), solid(3, 3, [0, 0, 0, 255]), { threshold: 0.1 });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('same size') });
  });

  it('rejects an image beyond the pixel-count guard', () => {
    const huge: RasterImage = { data: new Uint8ClampedArray(4), width: 10000, height: 10000 };
    const result = comparePixelData(huge, huge, { threshold: 0.1 });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('too large') });
  });
});
