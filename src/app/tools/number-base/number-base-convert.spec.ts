import fc from 'fast-check';
import { formatInBase, parseInBase } from './number-base-convert';

describe('parseInBase', () => {
  it('parses a hex value', () => {
    expect(parseInBase('ff', 16)).toEqual({ ok: true, value: 255n });
  });

  it('is case-insensitive', () => {
    expect(parseInBase('FF', 16)).toEqual({ ok: true, value: 255n });
  });

  it('parses a binary value', () => {
    expect(parseInBase('1010', 2)).toEqual({ ok: true, value: 10n });
  });

  it('parses base 36', () => {
    expect(parseInBase('z', 36)).toEqual({ ok: true, value: 35n });
    expect(parseInBase('10', 36)).toEqual({ ok: true, value: 36n });
  });

  it('parses a negative value', () => {
    expect(parseInBase('-1010', 2)).toEqual({ ok: true, value: -10n });
  });

  it('handles arbitrary precision beyond Number.MAX_SAFE_INTEGER', () => {
    expect(parseInBase('ffffffffffffffff', 16)).toEqual({ ok: true, value: 18446744073709551615n });
  });

  it('trims surrounding whitespace', () => {
    expect(parseInBase('  ff  ', 16)).toEqual({ ok: true, value: 255n });
  });

  it('rejects a digit invalid for the given base', () => {
    expect(parseInBase('2', 2)).toEqual({ ok: false, error: '"2" is not a valid digit in base 2.' });
  });

  it('rejects empty input', () => {
    expect(parseInBase('', 10)).toEqual({ ok: false, error: 'Enter a value.' });
  });

  it('rejects a lone minus sign', () => {
    expect(parseInBase('-', 10)).toEqual({ ok: false, error: 'Enter a value.' });
  });

  it('rejects an out-of-range base', () => {
    expect(parseInBase('1', 1)).toEqual({ ok: false, error: 'Base must be between 2 and 36.' });
    expect(parseInBase('1', 37)).toEqual({ ok: false, error: 'Base must be between 2 and 36.' });
  });
});

describe('formatInBase', () => {
  it('formats zero', () => {
    expect(formatInBase(0n, 10)).toBe('0');
  });

  it('formats to hex', () => {
    expect(formatInBase(255n, 16)).toBe('ff');
  });

  it('formats to binary', () => {
    expect(formatInBase(10n, 2)).toBe('1010');
  });

  it('formats a negative value with a leading minus sign', () => {
    expect(formatInBase(-10n, 2)).toBe('-1010');
  });

  it('formats base 36', () => {
    expect(formatInBase(35n, 36)).toBe('z');
    expect(formatInBase(36n, 36)).toBe('10');
  });

  it('round-trips arbitrary precision values through parse and format', () => {
    const original = 12345678901234567890n;
    expect(parseInBase(formatInBase(original, 16), 16)).toEqual({ ok: true, value: original });
  });

  it('returns an empty string for an out-of-range base', () => {
    expect(formatInBase(1n, 1)).toBe('');
  });
});

describe('round-trip property (DUDE_PRD.md §21 Phase 23 Item 4)', () => {
  it('parseInBase(formatInBase(x, base), base) === x for any bigint and base 2-36', () => {
    fc.assert(
      fc.property(fc.bigInt(), fc.integer({ min: 2, max: 36 }), (value, base) => {
        expect(parseInBase(formatInBase(value, base), base)).toEqual({ ok: true, value });
      }),
    );
  });
});
