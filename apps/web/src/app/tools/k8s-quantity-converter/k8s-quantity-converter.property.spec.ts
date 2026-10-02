import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { convertQuantity, formatQuantity, parseQuantity } from "@dude/tool-engine/tools/k8s-quantity-converter/k8s-quantity-converter-logic";

describe('k8s-quantity-converter properties', () => {
  it('round-trips integer quantities through supported units', () => {
    invariant(
      ({ value, unit }: { value: number; unit: string }) => formatQuantity(value, unit),
      fc.record({ value: fc.integer({ min: -100000, max: 100000 }).filter((value) => value !== 0), unit: fc.constantFrom('m', '', 'k') }),
      (formatted, { value }) => Math.abs((parseQuantity(formatted) ?? Infinity) - value) <= Math.max(1e-6, Math.abs(value) * 1e-12),
    );
  });
  it('never throws on arbitrary quantity strings', () => {
    neverThrows(convertQuantity, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
});
