export interface TransformState {
  readonly translateX: number;
  readonly translateY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotate: number;
  readonly skewX: number;
  readonly skewY: number;
  readonly origin: string;
}

export const DEFAULT_TRANSFORM_STATE: TransformState = {
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  skewX: 0,
  skewY: 0,
  origin: 'center',
};

export const ORIGIN_PRESETS: readonly string[] = [
  'top left',
  'top center',
  'top right',
  'center left',
  'center',
  'center right',
  'bottom left',
  'bottom center',
  'bottom right',
];

/**
 * Functions are emitted translate -> rotate -> scale -> skew when each is
 * non-identity — a conventional, spec-consistent order (translate first so
 * rotate/scale/skew apply around the already-repositioned element, matching
 * how most visual transform builders order these).
 */
export function buildTransformValue(t: TransformState): string {
  const parts: string[] = [];
  if (t.translateX !== 0 || t.translateY !== 0) parts.push(`translate(${t.translateX}px, ${t.translateY}px)`);
  if (t.rotate !== 0) parts.push(`rotate(${t.rotate}deg)`);
  if (t.scaleX !== 1 || t.scaleY !== 1) parts.push(`scale(${t.scaleX}, ${t.scaleY})`);
  if (t.skewX !== 0 || t.skewY !== 0) parts.push(`skew(${t.skewX}deg, ${t.skewY}deg)`);
  return parts.length === 0 ? 'none' : parts.join(' ');
}

export function buildTransformDeclaration(t: TransformState): string {
  return `transform: ${buildTransformValue(t)};\ntransform-origin: ${t.origin};`;
}
