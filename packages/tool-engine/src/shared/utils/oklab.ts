/**
 * OKLab/OKLCh conversion, per Björn Ottosson's reference formula:
 * https://bottosson.github.io/posts/oklab/
 *
 * Extracted here (from `color-convert.ts`, its first consumer) once a second
 * consumer (Tailwind Color Matcher) needed the same math — same "extract on
 * second consumer" pattern used throughout the codebase (see e.g.
 * `shared/utils/regex-ast-features.ts`).
 */

export interface OklabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function rgbToOklab(r: number, g: number, b: number): OklabColor {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function oklabToOklch(oklab: OklabColor): OklchColor {
  const c = Math.sqrt(oklab.a * oklab.a + oklab.b * oklab.b);
  const h = (Math.atan2(oklab.b, oklab.a) * (180 / Math.PI) + 360) % 360;
  return { l: oklab.l, c, h };
}

/** Euclidean distance in OKLab space — a good approximation of perceptual color difference. */
export function oklabDistance(a: OklabColor, b: OklabColor): number {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}
