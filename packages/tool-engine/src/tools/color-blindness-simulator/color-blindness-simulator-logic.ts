export type ColorBlindnessType = 'protanopia' | 'deuteranopia' | 'tritanopia';

export const COLOR_BLINDNESS_TYPES: readonly { readonly id: ColorBlindnessType; readonly label: string }[] = [
  { id: 'protanopia', label: 'Protanopia (red-blind)' },
  { id: 'deuteranopia', label: 'Deuteranopia (green-blind)' },
  { id: 'tritanopia', label: 'Tritanopia (blue-blind)' },
];

/**
 * Full-severity dichromacy simulation matrices (Machado, Oliveira & Fernandes,
 * 2009, "A Physiologically-based Model for Simulation of Color Vision
 * Deficiency" — the standard RGB-space approximation used by most browser
 * color-blindness simulators).
 */
const MATRICES: Record<ColorBlindnessType, readonly (readonly [number, number, number])[]> = {
  protanopia: [
    [0.152, 1.053, -0.205],
    [0.115, 0.786, 0.099],
    [-0.004, -0.048, 1.052],
  ],
  deuteranopia: [
    [0.367, 0.861, -0.228],
    [0.28, 0.673, 0.047],
    [-0.012, 0.043, 0.969],
  ],
  tritanopia: [
    [1.256, -0.077, -0.179],
    [-0.078, 0.931, 0.148],
    [0.005, 0.691, 0.304],
  ],
};

/** Pure per-pixel RGBA transform. Framework-free so it could move to a Worker later. */
export function simulateColorBlindness(rgba: ArrayLike<number>, type: ColorBlindnessType): Uint8ClampedArray<ArrayBuffer> {
  const [row0, row1, row2] = MATRICES[type];
  const out = new Uint8ClampedArray(rgba.length);

  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];

    out[i] = row0[0] * r + row0[1] * g + row0[2] * b;
    out[i + 1] = row1[0] * r + row1[1] * g + row1[2] * b;
    out[i + 2] = row2[0] * r + row2[1] * g + row2[2] * b;
    out[i + 3] = rgba[i + 3];
  }

  return out;
}
