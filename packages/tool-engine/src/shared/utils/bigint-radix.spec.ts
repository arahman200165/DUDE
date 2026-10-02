import { describe, expect, it } from 'vitest';
import { formatInBase, fromTwosComplement, gcd, lcm, parseInBase, toTwosComplement, wrapToBitWidth } from "./bigint-radix.js";

describe('parseInBase / formatInBase', () => {
  it('round-trips positive and negative values across bases', () => {
    const parsed = parseInBase('-ff', 16);
    expect(parsed).toEqual({ ok: true, value: -255n });
    expect(formatInBase(-255n, 16)).toBe('-ff');
    expect(formatInBase(255n, 2)).toBe('11111111');
  });

  it('rejects an out-of-range base and an invalid digit', () => {
    expect(parseInBase('10', 1).ok).toBe(false);
    expect(parseInBase('g', 16).ok).toBe(false);
    expect(parseInBase('', 10).ok).toBe(false);
  });

  it('formats zero as "0"', () => {
    expect(formatInBase(0n, 16)).toBe('0');
  });
});

describe('two\'s complement', () => {
  it('wraps a negative value into its unsigned 8-bit representation', () => {
    expect(toTwosComplement(-1n, 8)).toBe(255n);
    expect(toTwosComplement(-128n, 8)).toBe(128n);
  });

  it('interprets an unsigned value back as signed', () => {
    expect(fromTwosComplement(255n, 8)).toBe(-1n);
    expect(fromTwosComplement(127n, 8)).toBe(127n);
    expect(fromTwosComplement(128n, 8)).toBe(-128n);
  });

  it('round-trips through both directions', () => {
    for (const value of [-128n, -1n, 0n, 1n, 127n]) {
      expect(fromTwosComplement(toTwosComplement(value, 8), 8)).toBe(value);
    }
  });
});

describe('wrapToBitWidth', () => {
  it('wraps unsigned overflow modulo 2^bits', () => {
    expect(wrapToBitWidth(256n, 8, false)).toBe(0n);
    expect(wrapToBitWidth(-1n, 8, false)).toBe(255n);
  });

  it('wraps signed overflow via two\'s complement', () => {
    expect(wrapToBitWidth(128n, 8, true)).toBe(-128n);
    expect(wrapToBitWidth(-129n, 8, true)).toBe(127n);
  });
});

describe('gcd / lcm', () => {
  it('computes gcd/lcm for positive integers', () => {
    expect(gcd(48n, 18n)).toBe(6n);
    expect(lcm(4n, 6n)).toBe(12n);
  });

  it('ignores sign', () => {
    expect(gcd(-48n, 18n)).toBe(6n);
  });

  it('treats gcd/lcm with zero per convention', () => {
    expect(gcd(0n, 5n)).toBe(5n);
    expect(lcm(0n, 5n)).toBe(0n);
  });
});
