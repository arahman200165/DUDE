/**
 * Ratio simplification and missing-dimension math shared by the Image
 * Metadata Inspector (its second consumer) and the Aspect Ratio Calculator.
 */

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function simplifyRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return `${width}:${height}`;
  const divisor = gcd(Math.round(width), Math.round(height));
  return `${width / divisor}:${height / divisor}`;
}

export function solveWidthForRatio(height: number, ratioWidth: number, ratioHeight: number): number {
  return ratioHeight > 0 ? (height * ratioWidth) / ratioHeight : 0;
}

export function solveHeightForRatio(width: number, ratioWidth: number, ratioHeight: number): number {
  return ratioWidth > 0 ? (width * ratioHeight) / ratioWidth : 0;
}

export interface ParsedRatio {
  readonly width: number;
  readonly height: number;
}

/** Accepts "16:9", "16/9", or with decimals/whitespace variants of either separator. */
export function parseRatio(input: string): ParsedRatio | null {
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}
