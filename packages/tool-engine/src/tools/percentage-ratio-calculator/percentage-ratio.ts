import { gcd } from "../../shared/utils/bigint-radix.js";

export type PercentResult = { readonly ok: true; readonly value: number } | { readonly ok: false; readonly error: string };

function validateFinite(...values: readonly number[]): string | null {
  return values.every(Number.isFinite) ? null : 'Enter valid numbers.';
}

/** X% of Y. */
export function percentOf(percent: number, of: number): PercentResult {
  const error = validateFinite(percent, of);
  if (error) return { ok: false, error };
  return { ok: true, value: (percent / 100) * of };
}

/** X is what percent of Y? */
export function whatPercent(x: number, of: number): PercentResult {
  const error = validateFinite(x, of);
  if (error) return { ok: false, error };
  if (of === 0) return { ok: false, error: 'The "of" value cannot be zero.' };
  return { ok: true, value: (x / of) * 100 };
}

/** X is `percent`% of what total? */
export function findTotal(x: number, percent: number): PercentResult {
  const error = validateFinite(x, percent);
  if (error) return { ok: false, error };
  if (percent === 0) return { ok: false, error: 'Percent cannot be zero.' };
  return { ok: true, value: x / (percent / 100) };
}

/** Percentage change from `from` to `to` (positive = increase, negative = decrease). */
export function percentChange(from: number, to: number): PercentResult {
  const error = validateFinite(from, to);
  if (error) return { ok: false, error };
  if (from === 0) return { ok: false, error: 'Starting value cannot be zero.' };
  return { ok: true, value: ((to - from) / Math.abs(from)) * 100 };
}

export interface SimplifiedRatio {
  readonly a: bigint;
  readonly b: bigint;
}

export type RatioResult = { readonly ok: true; readonly value: SimplifiedRatio } | { readonly ok: false; readonly error: string };

/** Reduces an integer ratio A:B to lowest terms. */
export function simplifyRatio(a: bigint, b: bigint): RatioResult {
  if (a === 0n && b === 0n) return { ok: false, error: 'At least one term must be nonzero.' };
  const divisor = gcd(a, b) || 1n;
  return { ok: true, value: { a: a / divisor, b: b / divisor } };
}

/** Solves the proportion A:B = C:x for x. */
export function scaleRatio(a: number, b: number, c: number): PercentResult {
  const error = validateFinite(a, b, c);
  if (error) return { ok: false, error };
  if (a === 0) return { ok: false, error: 'The first ratio term (A) cannot be zero.' };
  return { ok: true, value: (b / a) * c };
}
