/** Pure percentage-savings math for the Image Compressor, extracted so it's testable without canvas/File APIs. */
export function computeSavingsPercent(originalSize: number, resultSize: number): number | null {
  if (!originalSize || !resultSize) return null;
  return Math.round((1 - resultSize / originalSize) * 100);
}
