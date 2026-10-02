import { Colord, colord, extend } from 'colord';
import cmykPlugin from 'colord/plugins/cmyk';
import namesPlugin from 'colord/plugins/names';
import labPlugin from 'colord/plugins/lab';
import lchPlugin from 'colord/plugins/lch';
import hwbPlugin from 'colord/plugins/hwb';
import { oklabToOklch, rgbToOklab } from "../../shared/utils/oklab.js";

extend([namesPlugin, cmykPlugin, labPlugin, lchPlugin, hwbPlugin]);

export { oklabToOklch, rgbToOklab } from "../../shared/utils/oklab.js";
export type { OklabColor, OklchColor } from "../../shared/utils/oklab.js";

export interface ColorFormats {
  readonly hex: string;
  readonly rgb: string;
  readonly hsl: string;
  readonly hsv: string;
  readonly cmyk: string;
  readonly lab: string;
  readonly lch: string;
  readonly hwb: string;
  readonly oklab: string;
  readonly oklch: string;
  readonly name?: string;
}

export type ColorParseResult =
  | { readonly ok: true; readonly formats: ColorFormats }
  | { readonly ok: false; readonly error: string };

export function parseColor(input: string): ColorParseResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a color to convert.' };

  const color = colord(trimmed);
  if (!color.isValid()) {
    return { ok: false, error: 'Could not recognize this as a color.' };
  }

  return { ok: true, formats: formatAll(color) };
}

function formatAll(color: Colord): ColorFormats {
  const hsv = color.toHsv();
  const lab = color.toLab();
  const lch = color.toLch();
  const hwb = color.toHwb();
  const rgb = color.toRgb();
  const oklab = rgbToOklab(rgb.r, rgb.g, rgb.b);
  const oklch = oklabToOklch(oklab);

  return {
    hex: color.toHex(),
    rgb: color.toRgbString(),
    hsl: color.toHslString(),
    hsv: `hsv(${Math.round(hsv.h)}, ${Math.round(hsv.s)}%, ${Math.round(hsv.v)}%)`,
    cmyk: color.toCmykString(),
    lab: `lab(${lab.l.toFixed(1)}% ${lab.a.toFixed(1)} ${lab.b.toFixed(1)})`,
    lch: `lch(${lch.l.toFixed(1)}% ${lch.c.toFixed(1)} ${lch.h.toFixed(1)})`,
    hwb: `hwb(${Math.round(hwb.h)} ${Math.round(hwb.w)}% ${Math.round(hwb.b)}%)`,
    oklab: `oklab(${(oklab.l * 100).toFixed(1)}% ${oklab.a.toFixed(4)} ${oklab.b.toFixed(4)})`,
    oklch: `oklch(${(oklch.l * 100).toFixed(1)}% ${oklch.c.toFixed(4)} ${oklch.h.toFixed(1)})`,
    name: color.toName({ closest: true }),
  };
}
