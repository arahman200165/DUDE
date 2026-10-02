import { describe, expect, it } from 'vitest';
import { generateRange, padNumber } from "./range-generate.js";

describe('generateRange', () => {
  it('generates an inclusive ascending range', () => {
    expect(generateRange({ start: 1, end: 5, step: 1 })).toEqual({ ok: true, value: [1, 2, 3, 4, 5] });
  });

  it('generates a descending range with a negative step', () => {
    expect(generateRange({ start: 10, end: 0, step: -2 })).toEqual({ ok: true, value: [10, 8, 6, 4, 2, 0] });
  });

  it('handles a fractional step without floating point noise', () => {
    const result = generateRange({ start: 0, end: 1, step: 0.1 });
    expect(result.ok && result.value).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it('rejects a zero step', () => {
    expect(generateRange({ start: 0, end: 10, step: 0 }).ok).toBe(false);
  });

  it('rejects a step direction that never reaches the end', () => {
    expect(generateRange({ start: 0, end: 10, step: -1 }).ok).toBe(false);
  });

  it('rejects a range that would generate too many values', () => {
    expect(generateRange({ start: 0, end: 10_000_000, step: 1 }).ok).toBe(false);
  });
});

describe('padNumber', () => {
  it('zero-pads positive numbers', () => {
    expect(padNumber(7, 3)).toBe('007');
  });

  it('keeps the sign outside the padding for negative numbers', () => {
    expect(padNumber(-7, 3)).toBe('-007');
  });

  it('returns the plain number when width is 0', () => {
    expect(padNumber(42, 0)).toBe('42');
  });
});
