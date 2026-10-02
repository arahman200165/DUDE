import { convertQuantity, formatQuantity, parseQuantity } from "./k8s-quantity-converter-logic.js";

describe('parseQuantity', () => {
  it('parses a bare integer', () => {
    expect(parseQuantity('2')).toBe(2);
  });

  it('parses millicores', () => {
    expect(parseQuantity('500m')).toBe(0.5);
  });

  it('parses a binary suffix', () => {
    expect(parseQuantity('1Gi')).toBe(1073741824);
  });

  it('parses a decimal SI suffix', () => {
    expect(parseQuantity('2k')).toBe(2000);
  });

  it('parses a negative and fractional value', () => {
    expect(parseQuantity('-1.5Gi')).toBeCloseTo(-1.5 * 2 ** 30);
  });

  it('returns null for a malformed quantity', () => {
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('1Xi')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });
});

describe('formatQuantity', () => {
  it('formats a canonical value into a given unit', () => {
    expect(formatQuantity(1073741824, 'Gi')).toBe('1Gi');
    expect(formatQuantity(0.5, 'm')).toBe('500m');
  });
});

describe('convertQuantity', () => {
  it('produces conversions across all units for a valid quantity', () => {
    const result = convertQuantity('1Gi');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canonical).toBe(1073741824);
    expect(result.conversions.find((c) => c.unit === 'Mi')?.formatted).toBe('1024Mi');
  });

  it('rejects empty input', () => {
    expect(convertQuantity('').ok).toBe(false);
  });

  it('rejects a malformed quantity', () => {
    expect(convertQuantity('abc').ok).toBe(false);
  });
});
