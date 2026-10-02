import { checkContrast, contrastRatio, wcagCompliance } from "./contrast-checker-logic.js";

describe('contrastRatio', () => {
  it('computes 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('computes 1:1 for identical colors', () => {
    expect(contrastRatio('#3b82f6', '#3b82f6')).toBeCloseTo(1, 5);
  });

  it('is symmetric regardless of argument order', () => {
    const a = contrastRatio('#111111', '#eeeeee');
    const b = contrastRatio('#eeeeee', '#111111');
    expect(a).toBeCloseTo(b, 5);
  });
});

describe('wcagCompliance', () => {
  it('passes every level for a 21:1 ratio', () => {
    expect(wcagCompliance(21)).toEqual({
      aaNormalText: true,
      aaLargeText: true,
      aaaNormalText: true,
      aaaLargeText: true,
      uiComponents: true,
    });
  });

  it('passes only AA large / UI components for a 3.5:1 ratio', () => {
    expect(wcagCompliance(3.5)).toEqual({
      aaNormalText: false,
      aaLargeText: true,
      aaaNormalText: false,
      aaaLargeText: false,
      uiComponents: true,
    });
  });

  it('fails everything below 3:1', () => {
    expect(wcagCompliance(1.5)).toEqual({
      aaNormalText: false,
      aaLargeText: false,
      aaaNormalText: false,
      aaaLargeText: false,
      uiComponents: false,
    });
  });
});

describe('checkContrast', () => {
  it('rejects an invalid foreground color', () => {
    expect(checkContrast('not-a-color', '#ffffff')).toEqual({
      ok: false,
      error: 'Could not recognize "not-a-color" as a color.',
    });
  });

  it('returns ratio and compliance for two valid colors', () => {
    const result = checkContrast('#000000', '#ffffff');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ratio).toBeCloseTo(21, 1);
    expect(result.compliance.aaaNormalText).toBe(true);
  });
});
