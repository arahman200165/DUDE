/**
 * Pure, framework-free arbitrary-precision radix and bit-width helpers shared
 * by Phase 11's numeric-calculator family (Programmer Calculator, Arbitrary
 * Precision Calculator, Numeric Representation Inspector, Number Theory
 * Toolkit) -- extracted fresh (mirroring `number-base/number-base-convert.ts`'s
 * pattern) rather than refactoring that already-shipped tool.
 */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

export type RadixParseResult = { readonly ok: true; readonly value: bigint } | { readonly ok: false; readonly error: string };

/** Parses a string as an arbitrary-precision integer in `base` (2-36). */
export function parseInBase(input: string, base: number): RadixParseResult {
  if (base < 2 || base > 36) return { ok: false, error: 'Base must be between 2 and 36.' };

  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a value.' };

  const negative = trimmed.startsWith('-');
  const digits = (negative ? trimmed.slice(1) : trimmed).toLowerCase();
  if (digits === '') return { ok: false, error: 'Enter a value.' };

  const bigBase = BigInt(base);
  let value = 0n;
  for (const char of digits) {
    const digitValue = DIGITS.indexOf(char);
    if (digitValue === -1 || digitValue >= base) {
      return { ok: false, error: `"${char}" is not a valid digit in base ${base}.` };
    }
    value = value * bigBase + BigInt(digitValue);
  }

  return { ok: true, value: negative ? -value : value };
}

/** Formats an arbitrary-precision integer as a string in `base` (2-36). */
export function formatInBase(value: bigint, base: number): string {
  if (base < 2 || base > 36) return '';
  if (value === 0n) return '0';

  const negative = value < 0n;
  const bigBase = BigInt(base);
  let remaining = negative ? -value : value;
  let digits = '';

  while (remaining > 0n) {
    const digitValue = Number(remaining % bigBase);
    digits = DIGITS[digitValue] + digits;
    remaining /= bigBase;
  }

  return negative ? `-${digits}` : digits;
}

/** Wraps a signed bigint into its unsigned `bits`-wide two's-complement representation. */
export function toTwosComplement(value: bigint, bits: number): bigint {
  const modulus = 1n << BigInt(bits);
  return ((value % modulus) + modulus) % modulus;
}

/** Interprets an unsigned `bits`-wide value as a signed two's-complement integer. */
export function fromTwosComplement(value: bigint, bits: number): bigint {
  const modulus = 1n << BigInt(bits);
  const wrapped = ((value % modulus) + modulus) % modulus;
  const signBit = 1n << BigInt(bits - 1);
  return wrapped >= signBit ? wrapped - modulus : wrapped;
}

/** Wraps `value` into the representable range of a `bits`-wide signed or unsigned integer. */
export function wrapToBitWidth(value: bigint, bits: number, signed: boolean): bigint {
  if (!signed) {
    const modulus = 1n << BigInt(bits);
    return ((value % modulus) + modulus) % modulus;
  }
  return fromTwosComplement(toTwosComplement(value, bits), bits);
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  const divisor = gcd(a, b);
  const x = a < 0n ? -a : a;
  const y = b < 0n ? -b : b;
  return (x / divisor) * y;
}
