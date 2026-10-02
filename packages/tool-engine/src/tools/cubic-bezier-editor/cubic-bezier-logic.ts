export interface BezierPoints {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface BezierPreset {
  readonly name: string;
  readonly points: BezierPoints;
}

/** The CSS spec's own named easing keywords, expressed as their equivalent cubic-bezier control points, plus a couple of common non-standard "fun" curves. */
export const BEZIER_PRESETS: readonly BezierPreset[] = [
  { name: 'ease', points: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } },
  { name: 'ease-in', points: { x1: 0.42, y1: 0, x2: 1, y2: 1 } },
  { name: 'ease-out', points: { x1: 0, y1: 0, x2: 0.58, y2: 1 } },
  { name: 'ease-in-out', points: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
  { name: 'back', points: { x1: 0.68, y1: -0.55, x2: 0.27, y2: 1.55 } },
  { name: 'bounce-ish', points: { x1: 0.68, y1: -0.6, x2: 0.32, y2: 1.6 } },
];

export type BezierValidationResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** Per the CSS spec, x1/x2 must be in [0,1] (a cubic-bezier() timing function must be a function of time); y1/y2 may be any value (enables overshoot/bounce). */
export function validateBezierPoints(points: BezierPoints): BezierValidationResult {
  if (points.x1 < 0 || points.x1 > 1 || points.x2 < 0 || points.x2 > 1) {
    return { ok: false, error: 'x1 and x2 must be between 0 and 1 — a timing function must be a function of time.' };
  }
  return { ok: true };
}

export function buildCubicBezierValue(points: BezierPoints): string {
  return `cubic-bezier(${points.x1}, ${points.y1}, ${points.x2}, ${points.y2})`;
}
