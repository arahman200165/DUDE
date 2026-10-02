import { colord } from 'colord';
import { OklabColor, oklabDistance, rgbToOklab } from "../../shared/utils/oklab.js";
import { TAILWIND_PALETTE, TailwindSwatch } from "./tailwind-palette-data.js";

export interface TailwindMatch {
  readonly family: string;
  readonly shade: number;
  readonly className: string;
  readonly css: string;
  readonly distance: number;
}

export type TailwindMatchResult =
  | { readonly ok: true; readonly matches: readonly TailwindMatch[] }
  | { readonly ok: false; readonly error: string };

/** Converts a Tailwind palette entry's native OKLCh into OKLab so it's directly comparable to an arbitrary color's OKLab. */
function swatchToOklab(swatch: TailwindSwatch): OklabColor {
  const hRad = (swatch.h * Math.PI) / 180;
  return {
    l: swatch.l / 100,
    a: swatch.c * Math.cos(hRad),
    b: swatch.c * Math.sin(hRad),
  };
}

const PALETTE_OKLAB: readonly { readonly swatch: TailwindSwatch; readonly oklab: OklabColor }[] = TAILWIND_PALETTE.map(
  (swatch) => ({ swatch, oklab: swatchToOklab(swatch) }),
);

export function findClosestTailwindColors(input: string, limit = 5): TailwindMatchResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a color to match.' };

  const color = colord(trimmed);
  if (!color.isValid()) return { ok: false, error: 'Could not recognize this as a color.' };

  const rgb = color.toRgb();
  const target = rgbToOklab(rgb.r, rgb.g, rgb.b);

  const ranked = PALETTE_OKLAB.map(({ swatch, oklab }) => ({
    family: swatch.family,
    shade: swatch.shade,
    className: `${swatch.family}-${swatch.shade}`,
    css: `oklch(${swatch.l}% ${swatch.c} ${swatch.h})`,
    distance: oklabDistance(target, oklab),
  })).sort((a, b) => a.distance - b.distance);

  return { ok: true, matches: ranked.slice(0, limit) };
}
