/**
 * Pure, framework-free value validation for the Barcode Generator's
 * supported symbologies. EAN-13/EAN-8/UPC-A share one GS1 check-digit
 * algorithm: walk the data digits right-to-left, alternating weights 3/1
 * starting at 3 (the position adjacent to the check digit), sum the
 * products, check digit = (10 - sum mod 10) mod 10 -- verified against the
 * well-known reference codes 4006381333931 (EAN-13), 036000291452 (UPC-A),
 * and 40123455 (EAN-8).
 */

export type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14' | 'codabar';

export interface BarcodeValidation {
  readonly ok: boolean;
  readonly message?: string;
}

const EAN_LENGTHS: Partial<Record<BarcodeFormat, number>> = {
  EAN13: 13,
  EAN8: 8,
  UPC: 12,
};

export function computeCheckDigit(dataDigits: string): number {
  let sum = 0;
  let weight = 3;
  for (let i = dataDigits.length - 1; i >= 0; i -= 1) {
    sum += Number(dataDigits[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function validateBarcodeValue(format: BarcodeFormat, value: string): BarcodeValidation {
  const trimmed = value.trim();
  if (trimmed === '') return { ok: false, message: 'Enter a value.' };

  const fullLength = EAN_LENGTHS[format];
  if (fullLength === undefined) return { ok: true };

  if (!/^\d+$/.test(trimmed)) return { ok: false, message: `${format} values must contain digits only.` };

  if (trimmed.length !== fullLength && trimmed.length !== fullLength - 1) {
    return { ok: false, message: `${format} must be ${fullLength - 1} digits (check digit optional) or ${fullLength} digits.` };
  }

  if (trimmed.length === fullLength) {
    const dataDigits = trimmed.slice(0, -1);
    const expected = computeCheckDigit(dataDigits);
    const actual = Number(trimmed[trimmed.length - 1]);
    if (actual !== expected) return { ok: false, message: `Invalid check digit -- expected ${expected}, got ${actual}.` };
  }

  return { ok: true };
}
