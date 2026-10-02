const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

export type BaseParseResult =
  | { readonly ok: true; readonly value: bigint }
  | { readonly ok: false; readonly error: string };

/** Parses a string as an arbitrary-precision integer in `base` (2–36). */
export function parseInBase(input: string, base: number): BaseParseResult {
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

/** Formats an arbitrary-precision integer as a string in `base` (2–36). */
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
