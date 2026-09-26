// Shared fast-check harness for Phase 23 / Tier 5 verification (DUDE_PRD.md §21). Every property
// test in this phase goes through one of these three helpers so runs stay deterministic
// (`fast-check.setup.ts` seeds and fixes numRuns globally) and so the assertions read the same
// way tool to tool.
import fc from 'fast-check';
import { expect } from 'vitest';

export interface PropertyOptions {
  readonly numRuns?: number;
}

/** Asserts `decode(encode(x)) === x` (structurally) for every generated `x`. */
export function roundTrip<T>(encode: (value: T) => unknown, decode: (encoded: unknown) => T, arb: fc.Arbitrary<T>, opts?: PropertyOptions): void {
  fc.assert(
    fc.property(arb, (value) => {
      expect(decode(encode(value))).toEqual(value);
    }),
    opts,
  );
}

/**
 * Asserts `fn` never throws for any generated input. When `assertShape` is given, it also runs
 * against the (non-throwing) return value, so callers can pin down type/shape invariants
 * (e.g. `(result) => expect(typeof result).toBe('string')`).
 */
export function neverThrows<T>(fn: (value: T) => unknown, arb: fc.Arbitrary<T>, opts?: PropertyOptions & { readonly assertShape?: (result: unknown) => void }): void {
  fc.assert(
    fc.property(arb, (value) => {
      let result: unknown;
      expect(() => {
        result = fn(value);
      }).not.toThrow();
      opts?.assertShape?.(result);
    }),
    opts,
  );
}

/** Asserts `predicate(fn(x), x)` holds for every generated `x`. */
export function invariant<T, R>(fn: (value: T) => R, arb: fc.Arbitrary<T>, predicate: (result: R, value: T) => boolean, opts?: PropertyOptions): void {
  fc.assert(
    fc.property(arb, (value) => {
      expect(predicate(fn(value), value)).toBe(true);
    }),
    opts,
  );
}
