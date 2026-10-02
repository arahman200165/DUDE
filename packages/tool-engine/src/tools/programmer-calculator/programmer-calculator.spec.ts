import { describe, expect, it } from 'vitest';
import { buildOperandView, computeOp, parseFlexible, toggleBit } from "./programmer-calculator.js";

describe('parseFlexible', () => {
  it('parses decimal, hex, binary, and octal with an optional sign', () => {
    expect(parseFlexible('42')).toEqual({ ok: true, value: 42n });
    expect(parseFlexible('-42')).toEqual({ ok: true, value: -42n });
    expect(parseFlexible('0xFF')).toEqual({ ok: true, value: 255n });
    expect(parseFlexible('0b1010')).toEqual({ ok: true, value: 10n });
    expect(parseFlexible('0o17')).toEqual({ ok: true, value: 15n });
  });

  it('rejects empty input', () => {
    expect(parseFlexible('').ok).toBe(false);
  });
});

describe('computeOp bitwise', () => {
  it('computes AND/OR/XOR/NOT within an 8-bit width', () => {
    expect(computeOp(0b1100n, 0b1010n, 8, 'and')).toEqual({ ok: true, value: 0b1000n });
    expect(computeOp(0b1100n, 0b1010n, 8, 'or')).toEqual({ ok: true, value: 0b1110n });
    expect(computeOp(0b1100n, 0b1010n, 8, 'xor')).toEqual({ ok: true, value: 0b0110n });
    expect(computeOp(0n, 0n, 8, 'not')).toEqual({ ok: true, value: 255n });
  });

  it('shifts left and right, wrapping to the bit width', () => {
    expect(computeOp(1n, 3n, 8, 'shl')).toEqual({ ok: true, value: 8n });
    expect(computeOp(0xffn, 4n, 8, 'shr')).toEqual({ ok: true, value: 0x0fn });
  });

  it('arithmetic-shifts a negative value sign-extending', () => {
    // -8 in 8-bit two's complement is 0xF8; arithmetic shift right by 1 should give -4 (0xFC).
    const result = computeOp(-8n, 1n, 8, 'sar');
    expect(result.ok && result.value).toBe(0xfcn);
  });
});

describe('computeOp arithmetic', () => {
  it('wraps addition/subtraction/multiplication to the bit width', () => {
    expect(computeOp(255n, 1n, 8, 'add')).toEqual({ ok: true, value: 0n });
    expect(computeOp(0n, 1n, 8, 'sub')).toEqual({ ok: true, value: 255n });
    expect(computeOp(16n, 16n, 8, 'mul')).toEqual({ ok: true, value: 0n });
  });

  it('rejects division and modulo by zero', () => {
    expect(computeOp(10n, 0n, 8, 'div').ok).toBe(false);
    expect(computeOp(10n, 0n, 8, 'mod').ok).toBe(false);
  });
});

describe('buildOperandView', () => {
  it('shows -1 as all-ones with matching signed/unsigned decimal', () => {
    const view = buildOperandView(-1n, 8);
    expect(view.binary).toBe('11111111');
    expect(view.hex).toBe('ff');
    expect(view.octal).toBe('377');
    expect(view.signedDecimal).toBe('-1');
    expect(view.unsignedDecimal).toBe('255');
    expect(view.bits.every(Boolean)).toBe(true);
  });
});

describe('toggleBit', () => {
  it('flips the requested bit (MSB-first indexing)', () => {
    expect(toggleBit(0n, 8, 7)).toBe(1n); // least significant bit
    expect(toggleBit(0n, 8, 0)).toBe(0x80n); // most significant bit
    expect(toggleBit(0xffn, 8, 0)).toBe(0x7fn);
  });
});
