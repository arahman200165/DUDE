import { describe, expect, it } from 'vitest';
import { findTotal, percentChange, percentOf, scaleRatio, simplifyRatio, whatPercent } from "./percentage-ratio.js";

describe('percentOf', () => {
  it('computes X% of Y', () => {
    expect(percentOf(25, 200)).toEqual({ ok: true, value: 50 });
  });
});

describe('whatPercent', () => {
  it('computes what percent X is of Y', () => {
    expect(whatPercent(50, 200)).toEqual({ ok: true, value: 25 });
  });

  it('rejects a zero "of" value', () => {
    expect(whatPercent(1, 0).ok).toBe(false);
  });
});

describe('findTotal', () => {
  it('finds the total given X is percent% of it', () => {
    expect(findTotal(50, 25)).toEqual({ ok: true, value: 200 });
  });

  it('rejects a zero percent', () => {
    expect(findTotal(1, 0).ok).toBe(false);
  });
});

describe('percentChange', () => {
  it('computes a percentage increase', () => {
    expect(percentChange(200, 250)).toEqual({ ok: true, value: 25 });
  });

  it('computes a percentage decrease as negative', () => {
    expect(percentChange(200, 150)).toEqual({ ok: true, value: -25 });
  });

  it('rejects a zero starting value', () => {
    expect(percentChange(0, 10).ok).toBe(false);
  });
});

describe('simplifyRatio', () => {
  it('reduces a ratio to lowest terms', () => {
    expect(simplifyRatio(16n, 9n)).toEqual({ ok: true, value: { a: 16n, b: 9n } });
    expect(simplifyRatio(8n, 12n)).toEqual({ ok: true, value: { a: 2n, b: 3n } });
  });

  it('rejects a 0:0 ratio', () => {
    expect(simplifyRatio(0n, 0n).ok).toBe(false);
  });
});

describe('scaleRatio', () => {
  it('solves a proportion A:B = C:x', () => {
    // 2:3 = 10:x -> x = 15
    expect(scaleRatio(2, 3, 10)).toEqual({ ok: true, value: 15 });
  });

  it('rejects a zero A term', () => {
    expect(scaleRatio(0, 3, 10).ok).toBe(false);
  });
});
