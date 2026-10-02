import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { buildOperandView, computeOp, type BitWidth, toggleBit } from "@dude/tool-engine/tools/programmer-calculator/programmer-calculator";

const widths = fc.constantFrom<BitWidth>(8, 16, 32, 64);
const values = fc.bigInt({ min: -(1n << 70n), max: 1n << 70n });

describe('programmer calculator properties', () => {
  it('produces a width-sized operand representation', () => {
    invariant(([value, width]: [bigint, BitWidth]) => buildOperandView(value, width), fc.tuple(values, widths), (view, [, width]) => view.bits.length === width && view.binary.length === width && /^[0-9a-f]+$/.test(view.hex));
  });

  it('flipping the same bit twice restores the wrapped value', () => {
    invariant(({ value, width, bit }) => toggleBit(toggleBit(value, width, bit % width), width, bit % width), fc.record({ value: values, width: widths, bit: fc.integer({ min: 0, max: 63 }) }), (twice, { value, width }) => twice === ((value % (1n << BigInt(width))) + (1n << BigInt(width))) % (1n << BigInt(width)));
  });

  it('never throws for supported operations', () => {
    neverThrows(([a, b, width, op]: [bigint, bigint, BitWidth, 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'and' | 'or' | 'xor' | 'not' | 'shl' | 'shr' | 'sar']) => computeOp(a, b, width, op), fc.tuple(values, values, widths, fc.constantFrom('add', 'sub', 'mul', 'div', 'mod', 'and', 'or', 'xor', 'not', 'shl', 'shr', 'sar')));
  });
});
