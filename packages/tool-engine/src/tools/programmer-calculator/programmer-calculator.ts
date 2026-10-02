import { formatInBase, fromTwosComplement, parseInBase, toTwosComplement } from "../../shared/utils/bigint-radix.js";

export type BitWidth = 8 | 16 | 32 | 64;

export type CalcOp = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'and' | 'or' | 'xor' | 'not' | 'shl' | 'shr' | 'sar';

export type CalcResult = { readonly ok: true; readonly value: bigint } | { readonly ok: false; readonly error: string };

/** Parses a value with an optional sign and an optional 0x/0b/0o base prefix; bare digits are decimal. */
export function parseFlexible(input: string): CalcResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a value.' };

  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;

  const parsed = /^0x/i.test(body)
    ? parseInBase(body.slice(2), 16)
    : /^0b/i.test(body)
      ? parseInBase(body.slice(2), 2)
      : /^0o/i.test(body)
        ? parseInBase(body.slice(2), 8)
        : parseInBase(body, 10);

  if (!parsed.ok) return parsed;
  return { ok: true, value: negative ? -parsed.value : parsed.value };
}

export function computeOp(a: bigint, b: bigint, width: BitWidth, op: CalcOp): CalcResult {
  const modulus = 1n << BigInt(width);
  const wrap = (v: bigint): bigint => ((v % modulus) + modulus) % modulus;
  const ua = wrap(a);
  const ub = wrap(b);
  const shiftAmount = ub % BigInt(width);

  switch (op) {
    case 'add':
      return { ok: true, value: wrap(a + b) };
    case 'sub':
      return { ok: true, value: wrap(a - b) };
    case 'mul':
      return { ok: true, value: wrap(a * b) };
    case 'div':
      return b === 0n ? { ok: false, error: 'Division by zero.' } : { ok: true, value: wrap(a / b) };
    case 'mod':
      return b === 0n ? { ok: false, error: 'Division by zero.' } : { ok: true, value: wrap(a % b) };
    case 'and':
      return { ok: true, value: ua & ub };
    case 'or':
      return { ok: true, value: ua | ub };
    case 'xor':
      return { ok: true, value: ua ^ ub };
    case 'not':
      return { ok: true, value: ~ua & (modulus - 1n) };
    case 'shl':
      return { ok: true, value: (ua << shiftAmount) & (modulus - 1n) };
    case 'shr':
      return { ok: true, value: ua >> shiftAmount };
    case 'sar':
      return { ok: true, value: toTwosComplement(fromTwosComplement(ua, width) >> shiftAmount, width) };
  }
}

export interface OperandView {
  readonly signedDecimal: string;
  readonly unsignedDecimal: string;
  readonly hex: string;
  readonly octal: string;
  readonly binary: string;
  /** MSB first, length equals `width`. */
  readonly bits: readonly boolean[];
}

export function buildOperandView(value: bigint, width: BitWidth): OperandView {
  const modulus = 1n << BigInt(width);
  const unsigned = ((value % modulus) + modulus) % modulus;
  const binary = formatInBase(unsigned, 2).padStart(width, '0');

  return {
    signedDecimal: fromTwosComplement(unsigned, width).toString(),
    unsignedDecimal: unsigned.toString(),
    hex: formatInBase(unsigned, 16).padStart(width / 4, '0'),
    octal: formatInBase(unsigned, 8),
    binary,
    bits: Array.from(binary, (c) => c === '1'),
  };
}

/** Flips the bit at `bitIndex` (0 = most significant bit) and returns the new width-wrapped value. */
export function toggleBit(value: bigint, width: BitWidth, bitIndex: number): bigint {
  const modulus = 1n << BigInt(width);
  const unsigned = ((value % modulus) + modulus) % modulus;
  const shift = BigInt(width - 1 - bitIndex);
  return unsigned ^ (1n << shift);
}
