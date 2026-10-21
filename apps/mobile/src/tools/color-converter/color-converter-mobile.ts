import { parseColor, type ColorFormats } from '@dude/tool-engine/tools/color-converter/color-convert';
import type { KeyValueRow } from '../../kit';

export interface ColorView {
  readonly formats: ColorFormats;
  /** Opaque `#rrggbb` of the parsed color (the swatch is drawn over a plain panel, alpha is shown separately). */
  readonly swatch: string;
  /** Alpha in 0..1 when the input carried transparency, otherwise null. */
  readonly alpha: number | null;
  readonly rows: readonly KeyValueRow[];
}

/** Alpha from the engine's `rgb()`/`rgba()` string; null when the color is opaque. */
export function alphaOf(rgb: string): number | null {
  const match = /^rgba\(.*,\s*([\d.]+)\)$/.exec(rgb);
  if (!match) return null;
  const alpha = Number(match[1]);
  return Number.isFinite(alpha) && alpha < 1 ? alpha : null;
}

export function colorRows(formats: ColorFormats): readonly KeyValueRow[] {
  return [
    { key: 'hex', label: 'HEX', value: formats.hex },
    { key: 'rgb', label: 'RGB', value: formats.rgb },
    { key: 'hsl', label: 'HSL', value: formats.hsl },
    { key: 'hsv', label: 'HSV', value: formats.hsv },
    { key: 'cmyk', label: 'CMYK', value: formats.cmyk },
    { key: 'lab', label: 'LAB', value: formats.lab },
    { key: 'lch', label: 'LCH', value: formats.lch },
    { key: 'hwb', label: 'HWB', value: formats.hwb },
    { key: 'oklab', label: 'OKLAB', value: formats.oklab },
    { key: 'oklch', label: 'OKLCH', value: formats.oklch },
    { key: 'name', label: 'Closest name', value: formats.name ?? '-' },
  ];
}

export type ColorViewResult = { readonly ok: true; readonly view: ColorView } | { readonly ok: false; readonly error: string };

export function colorView(input: string): ColorViewResult {
  const parsed = parseColor(input);
  if (!parsed.ok) return parsed;
  const alpha = alphaOf(parsed.formats.rgb);
  return {
    ok: true,
    view: {
      formats: parsed.formats,
      swatch: parsed.formats.hex.slice(0, 7),
      alpha,
      rows: alpha === null ? colorRows(parsed.formats) : [...colorRows(parsed.formats), { key: 'alpha', label: 'Alpha', value: String(alpha) }],
    },
  };
}
