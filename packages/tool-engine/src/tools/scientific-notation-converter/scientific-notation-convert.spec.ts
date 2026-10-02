import { describe, expect, it } from 'vitest';
import { convertScientific } from "./scientific-notation-convert.js";

describe('convertScientific', () => {
  it('converts a plain integer to scientific and engineering notation', () => {
    const result = convertScientific('12345', 6);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.mantissa).toBe(1.2345);
    expect(result.value.exponent).toBe(4);
    expect(result.value.scientific).toBe('1.2345e+4');
    expect(result.value.engineering).toBe('12.345e+3');
  });

  it('converts a small decimal, choosing a negative engineering exponent that is a multiple of 3', () => {
    const result = convertScientific('0.000123', 6);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.exponent).toBe(-4);
    expect(result.value.engineering).toBe('123e-6');
  });

  it('parses scientific notation as input too', () => {
    const result = convertScientific('6.022e23', 4);
    expect(result.ok && result.value.exponent).toBe(23);
  });

  it('handles zero', () => {
    const result = convertScientific('0');
    expect(result.ok && result.value.scientific).toBe('0e+0');
    expect(result.ok && result.value.engineering).toBe('0e+0');
  });

  it('rejects empty, non-numeric, and non-finite input', () => {
    expect(convertScientific('').ok).toBe(false);
    expect(convertScientific('not a number').ok).toBe(false);
    expect(convertScientific('Infinity').ok).toBe(false);
  });
});
