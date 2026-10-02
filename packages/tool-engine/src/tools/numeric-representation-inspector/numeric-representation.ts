import { formatInBase, fromTwosComplement, parseInBase } from "../../shared/utils/bigint-radix.js";

// --- Endianness Converter ---

export type EndiannessWidth = 16 | 32 | 64;

export interface EndiannessBreakdown {
  readonly bigEndianValue: bigint;
  readonly littleEndianValue: bigint;
  readonly bigEndianHex: string;
  readonly littleEndianHex: string;
}

export type EndiannessResult = { readonly ok: true; readonly value: EndiannessBreakdown } | { readonly ok: false; readonly error: string };

export function inspectEndianness(hexInput: string, width: EndiannessWidth): EndiannessResult {
  const cleaned = hexInput.replace(/\s+/g, '');
  const expectedDigits = width / 4;

  if (cleaned === '') return { ok: false, error: 'Enter some hex.' };
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return { ok: false, error: 'Enter hex digits only.' };
  if (cleaned.length !== expectedDigits) return { ok: false, error: `Enter exactly ${expectedDigits} hex digits for a ${width}-bit value.` };

  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) bytes.push(parseInt(cleaned.slice(i, i + 2), 16));

  const bigEndianValue = bytesToBigIntBE(bytes);
  const littleEndianValue = bytesToBigIntBE([...bytes].reverse());

  return {
    ok: true,
    value: {
      bigEndianValue,
      littleEndianValue,
      bigEndianHex: bigEndianValue.toString(16).padStart(expectedDigits, '0'),
      littleEndianHex: littleEndianValue.toString(16).padStart(expectedDigits, '0'),
    },
  };
}

function bytesToBigIntBE(bytes: readonly number[]): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

// --- IEEE-754 Floating Point Inspector ---

export type FloatPrecision = 32 | 64;

export interface Ieee754Breakdown {
  readonly sign: 0 | 1;
  readonly exponentBits: string;
  readonly exponentValue: number;
  readonly mantissaBits: string;
  readonly hex: string;
  readonly reconstructed: number;
}

export type Ieee754Result = { readonly ok: true; readonly value: Ieee754Breakdown } | { readonly ok: false; readonly error: string };

export function inspectIeee754(input: string, precision: FloatPrecision): Ieee754Result {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a number.' };

  const num = Number(trimmed);
  if (Number.isNaN(num) && trimmed.toLowerCase() !== 'nan') return { ok: false, error: 'Enter a valid number.' };

  const byteLength = precision === 32 ? 4 : 8;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  if (precision === 32) view.setFloat32(0, num);
  else view.setFloat64(0, num);

  let bits = 0n;
  for (let i = 0; i < byteLength; i++) bits = (bits << 8n) | BigInt(view.getUint8(i));

  const exponentBitsCount = precision === 32 ? 8 : 11;
  const bias = precision === 32 ? 127 : 1023;
  const binaryStr = bits.toString(2).padStart(precision, '0');

  const sign = binaryStr[0] === '1' ? 1 : 0;
  const exponentBits = binaryStr.slice(1, 1 + exponentBitsCount);
  const mantissaBits = binaryStr.slice(1 + exponentBitsCount);

  return {
    ok: true,
    value: {
      sign,
      exponentBits,
      exponentValue: parseInt(exponentBits, 2) - bias,
      mantissaBits,
      hex: bits.toString(16).padStart(byteLength * 2, '0'),
      reconstructed: precision === 32 ? view.getFloat32(0) : view.getFloat64(0),
    },
  };
}

// --- Integer Representation Inspector ---

export type IntegerBitWidth = 8 | 16 | 32 | 64;

const INTEGER_WIDTHS: readonly IntegerBitWidth[] = [8, 16, 32, 64];

export interface IntegerWidthRow {
  readonly bits: IntegerBitWidth;
  readonly unsignedValue: bigint;
  readonly signedValue: bigint;
  readonly hex: string;
  readonly binary: string;
  readonly octal: string;
  readonly overflowed: boolean;
}

export type IntegerInspectResult =
  | { readonly ok: true; readonly value: readonly IntegerWidthRow[] }
  | { readonly ok: false; readonly error: string };

export function inspectInteger(input: string): IntegerInspectResult {
  const parsed = parseInBase(input, 10);
  if (!parsed.ok) return parsed;

  const value = parsed.value;
  const rows = INTEGER_WIDTHS.map((bits): IntegerWidthRow => {
    const modulus = 1n << BigInt(bits);
    const unsignedValue = ((value % modulus) + modulus) % modulus;
    return {
      bits,
      unsignedValue,
      signedValue: fromTwosComplement(unsignedValue, bits),
      hex: formatInBase(unsignedValue, 16).padStart(bits / 4, '0'),
      binary: formatInBase(unsignedValue, 2).padStart(bits, '0'),
      octal: formatInBase(unsignedValue, 8),
      overflowed: value < 0n || value >= modulus,
    };
  });

  return { ok: true, value: rows };
}
