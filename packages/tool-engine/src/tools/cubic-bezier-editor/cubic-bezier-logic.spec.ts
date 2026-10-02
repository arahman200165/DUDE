import { BEZIER_PRESETS, buildCubicBezierValue, validateBezierPoints } from "./cubic-bezier-logic.js";

describe('buildCubicBezierValue', () => {
  it('formats the 4 control points as a cubic-bezier() function', () => {
    expect(buildCubicBezierValue({ x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 })).toBe('cubic-bezier(0.25, 0.1, 0.25, 1)');
  });

  it('supports a y value outside [0,1] for overshoot curves', () => {
    expect(buildCubicBezierValue({ x1: 0.68, y1: -0.55, x2: 0.27, y2: 1.55 })).toBe('cubic-bezier(0.68, -0.55, 0.27, 1.55)');
  });
});

describe('validateBezierPoints', () => {
  it('accepts x1/x2 within [0,1] regardless of y', () => {
    expect(validateBezierPoints({ x1: 0, y1: -5, x2: 1, y2: 5 })).toEqual({ ok: true });
  });

  it('rejects x1 outside [0,1]', () => {
    const result = validateBezierPoints({ x1: -0.1, y1: 0, x2: 0.5, y2: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects x2 outside [0,1]', () => {
    const result = validateBezierPoints({ x1: 0.5, y1: 0, x2: 1.1, y2: 1 });
    expect(result.ok).toBe(false);
  });
});

describe('BEZIER_PRESETS', () => {
  it('every preset has valid x1/x2 control points', () => {
    for (const preset of BEZIER_PRESETS) {
      expect(validateBezierPoints(preset.points).ok).toBe(true);
    }
  });
});
