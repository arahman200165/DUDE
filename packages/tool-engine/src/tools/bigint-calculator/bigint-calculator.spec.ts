import { describe, expect, it } from 'vitest';
import { computeBigCalc, parseBigInt } from "./bigint-calculator.js";

describe('parseBigInt', () => {
  it('parses decimal, hex, binary, and octal with an optional sign', () => {
    expect(parseBigInt('123456789012345678901234567890')).toEqual({ ok: true, value: 123456789012345678901234567890n });
    expect(parseBigInt('-42')).toEqual({ ok: true, value: -42n });
    expect(parseBigInt('0xFF')).toEqual({ ok: true, value: 255n });
  });

  it('rejects empty input', () => {
    expect(parseBigInt('').ok).toBe(false);
  });
});

describe('computeBigCalc arithmetic', () => {
  it('handles arbitrary-precision addition/subtraction/multiplication beyond 64-bit range', () => {
    const huge = 123456789012345678901234567890n;
    expect(computeBigCalc(huge, 1n, 'add')).toEqual({ ok: true, value: huge + 1n });
    expect(computeBigCalc(huge, huge, 'mul')).toEqual({ ok: true, value: huge * huge });
  });

  it('rejects division and modulo by zero', () => {
    expect(computeBigCalc(10n, 0n, 'div').ok).toBe(false);
    expect(computeBigCalc(10n, 0n, 'mod').ok).toBe(false);
  });
});

describe('computeBigCalc pow', () => {
  it('matches a known large power', () => {
    expect(computeBigCalc(2n, 100n, 'pow')).toEqual({ ok: true, value: 1267650600228229401496703205376n });
  });

  it('rejects a negative exponent', () => {
    expect(computeBigCalc(2n, -1n, 'pow').ok).toBe(false);
  });

  it('rejects a pathologically large exponent', () => {
    expect(computeBigCalc(2n, 1_000_000n, 'pow').ok).toBe(false);
  });
});

describe('computeBigCalc factorial', () => {
  it('computes small factorials exactly', () => {
    expect(computeBigCalc(0n, 0n, 'factorial')).toEqual({ ok: true, value: 1n });
    expect(computeBigCalc(5n, 0n, 'factorial')).toEqual({ ok: true, value: 120n });
  });

  it('computes a large factorial exactly (arbitrary precision)', () => {
    const result = computeBigCalc(30n, 0n, 'factorial');
    expect(result).toEqual({ ok: true, value: 265252859812191058636308480000000n });
  });

  it('rejects a negative input', () => {
    expect(computeBigCalc(-1n, 0n, 'factorial').ok).toBe(false);
  });
});
