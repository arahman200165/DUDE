import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { computeCheckDigit, validateBarcodeValue, type BarcodeFormat } from "@dude/tool-engine/tools/barcode-generator/barcode-validate";

function digitsOfLength(length: number): fc.Arbitrary<string> {
  return fc.array(fc.integer({ min: 0, max: 9 }), { minLength: length, maxLength: length }).map((digits) => digits.join(''));
}

describe('computeCheckDigit / validateBarcodeValue property', () => {
  it('computeCheckDigit always produces a value that validates as EAN-13 (12 data digits)', () => {
    invariant(
      (dataDigits: string) => validateBarcodeValue('EAN13', dataDigits + computeCheckDigit(dataDigits)),
      digitsOfLength(12),
      (result) => result.ok,
    );
  });

  it('computeCheckDigit always produces a value that validates as UPC (11 data digits)', () => {
    invariant(
      (dataDigits: string) => validateBarcodeValue('UPC', dataDigits + computeCheckDigit(dataDigits)),
      digitsOfLength(11),
      (result) => result.ok,
    );
  });

  it('computeCheckDigit always produces a value that validates as EAN-8 (7 data digits)', () => {
    invariant(
      (dataDigits: string) => validateBarcodeValue('EAN8', dataDigits + computeCheckDigit(dataDigits)),
      digitsOfLength(7),
      (result) => result.ok,
    );
  });
});

describe('fuzzing', () => {
  it('validateBarcodeValue never throws for any format/text combination', () => {
    const formatArb = fc.constantFrom<BarcodeFormat>('CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14', 'codabar');
    neverThrows(([format, value]: [BarcodeFormat, string]) => validateBarcodeValue(format, value), fc.tuple(formatArb, fc.string()));
  });
});
