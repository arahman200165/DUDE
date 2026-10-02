import { colord } from 'colord';

export type PaletteType = 'complementary' | 'split-complementary' | 'analogous' | 'triadic' | 'tetradic' | 'monochromatic';

export const PALETTE_TYPES: readonly { readonly id: PaletteType; readonly label: string }[] = [
  { id: 'complementary', label: 'Complementary' },
  { id: 'split-complementary', label: 'Split-complementary' },
  { id: 'analogous', label: 'Analogous' },
  { id: 'triadic', label: 'Triadic' },
  { id: 'tetradic', label: 'Tetradic' },
  { id: 'monochromatic', label: 'Monochromatic' },
];

export type PaletteResult = { readonly ok: true; readonly colors: readonly string[] } | { readonly ok: false; readonly error: string };

export function generatePalette(baseColorInput: string, type: PaletteType): PaletteResult {
  const trimmed = baseColorInput.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a base color to generate a palette.' };

  const base = colord(trimmed);
  if (!base.isValid()) return { ok: false, error: 'Could not recognize this as a color.' };

  switch (type) {
    case 'complementary':
      return { ok: true, colors: [base.toHex(), base.rotate(180).toHex()] };
    case 'split-complementary':
      return { ok: true, colors: [base.toHex(), base.rotate(150).toHex(), base.rotate(210).toHex()] };
    case 'analogous':
      return { ok: true, colors: [base.rotate(-30).toHex(), base.toHex(), base.rotate(30).toHex()] };
    case 'triadic':
      return { ok: true, colors: [base.toHex(), base.rotate(120).toHex(), base.rotate(240).toHex()] };
    case 'tetradic':
      return { ok: true, colors: [base.toHex(), base.rotate(60).toHex(), base.rotate(180).toHex(), base.rotate(240).toHex()] };
    case 'monochromatic':
      return {
        ok: true,
        colors: [
          base.lighten(0.3).toHex(),
          base.lighten(0.15).toHex(),
          base.toHex(),
          base.darken(0.15).toHex(),
          base.darken(0.3).toHex(),
        ],
      };
  }
}
