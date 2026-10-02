/** Pure, framework-free pixel-sampling helper for canvas `ImageData`. */

export interface SampledPixel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export function samplePixel(imageData: ImageData, x: number, y: number): SampledPixel | null {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= imageData.width || py >= imageData.height) return null;

  const offset = (py * imageData.width + px) * 4;
  return {
    r: imageData.data[offset],
    g: imageData.data[offset + 1],
    b: imageData.data[offset + 2],
    a: imageData.data[offset + 3],
  };
}
