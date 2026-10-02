import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { inspectEndianness, inspectIeee754, inspectInteger } from "@dude/tool-engine/tools/numeric-representation-inspector/numeric-representation";

describe('numeric representation properties', () => {
  it('formats arbitrary correctly sized hex values at their selected widths', () => {
    fc.assert(fc.property(fc.constantFrom(16, 32, 64), fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }), (width, value) => {
      const masked = value & ((1n << BigInt(width)) - 1n);
      const input = masked.toString(16).padStart(width / 4, '0');
      const result = inspectEndianness(input, width);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.bigEndianHex).toHaveLength(width / 4);
        expect(result.value.littleEndianHex).toHaveLength(width / 4);
      }
    }));
  });
  it('preserves the input value through IEEE-754 encode/decode for finite float64s', () => {
    invariant((value) => inspectIeee754(String(value), 64), fc.double({ noNaN: true, noDefaultInfinity: true }), (result, value) => result.ok && Object.is(result.value.reconstructed, value));
  });
  it('never throws on arbitrary integer text', () => {
    neverThrows(inspectInteger, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
});
