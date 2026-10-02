export interface BorderRadiusCorners {
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomRight: number;
  readonly bottomLeft: number;
}

export type BorderRadiusUnit = 'px' | '%';

export const DEFAULT_CORNERS: BorderRadiusCorners = { topLeft: 16, topRight: 16, bottomRight: 16, bottomLeft: 16 };

/**
 * Just the 4 corner values (no separate horizontal/vertical "elliptical"
 * radius pair per corner) -- a deliberate scope cut. The CSS shorthand's
 * `<h> / <v>` elliptical syntax is a real but rarely-needed feature; this
 * covers the overwhelming majority of real-world border-radius usage.
 */
export function buildBorderRadiusValue(corners: BorderRadiusCorners, unit: BorderRadiusUnit): string {
  const { topLeft, topRight, bottomRight, bottomLeft } = corners;
  if (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft) {
    return `${topLeft}${unit}`;
  }
  return `${topLeft}${unit} ${topRight}${unit} ${bottomRight}${unit} ${bottomLeft}${unit}`;
}

export function buildBorderRadiusDeclaration(corners: BorderRadiusCorners, unit: BorderRadiusUnit): string {
  return `border-radius: ${buildBorderRadiusValue(corners, unit)};`;
}
