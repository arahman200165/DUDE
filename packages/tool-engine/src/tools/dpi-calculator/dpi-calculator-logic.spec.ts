import { computeDpi, computePhysicalSizeForDpi, computePixelsForDpi, fromInches, toInches } from "./dpi-calculator-logic.js";

describe('toInches / fromInches', () => {
  it('treats inches as a no-op', () => {
    expect(toInches(5, 'in')).toBe(5);
    expect(fromInches(5, 'in')).toBe(5);
  });

  it('converts centimeters to inches and back', () => {
    expect(toInches(2.54, 'cm')).toBeCloseTo(1, 10);
    expect(fromInches(1, 'cm')).toBeCloseTo(2.54, 10);
  });

  it('converts millimeters to inches and back', () => {
    expect(toInches(25.4, 'mm')).toBeCloseTo(1, 10);
    expect(fromInches(1, 'mm')).toBeCloseTo(25.4, 10);
  });
});

describe('computeDpi', () => {
  it('computes DPI from pixel dimensions and a physical size in inches', () => {
    const result = computeDpi(300, 300, 1, 1, 'in');
    expect(result.horizontalDpi).toBe(300);
    expect(result.verticalDpi).toBe(300);
  });

  it('computes independent horizontal/vertical DPI when the physical size is not square', () => {
    const result = computeDpi(1200, 600, 4, 2, 'in');
    expect(result.horizontalDpi).toBe(300);
    expect(result.verticalDpi).toBe(300);
  });

  it('returns 0 for a zero physical dimension instead of dividing by zero', () => {
    expect(computeDpi(300, 300, 0, 1, 'in').horizontalDpi).toBe(0);
  });
});

describe('computePixelsForDpi', () => {
  it('computes required pixel dimensions for a target DPI', () => {
    expect(computePixelsForDpi(4, 6, 'in', 300)).toEqual({ width: 1200, height: 1800 });
  });
});

describe('computePhysicalSizeForDpi', () => {
  it('computes physical size in inches from pixel dimensions and DPI', () => {
    const result = computePhysicalSizeForDpi(1200, 1800, 300, 'in');
    expect(result.width).toBeCloseTo(4, 10);
    expect(result.height).toBeCloseTo(6, 10);
  });

  it('returns zero size for a non-positive DPI', () => {
    expect(computePhysicalSizeForDpi(1200, 1800, 0, 'in')).toEqual({ width: 0, height: 0 });
  });
});
