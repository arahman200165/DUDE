import { describe, expect, it } from 'vitest';
import { computeCheckDigit, validateBarcodeValue } from "./barcode-validate.js";

describe('computeCheckDigit', () => {
  it('computes the EAN-13 check digit for a known reference code', () => {
    expect(computeCheckDigit('400638133393')).toBe(1);
  });

  it('computes the UPC-A check digit for a known reference code', () => {
    expect(computeCheckDigit('03600029145')).toBe(2);
  });

  it('computes the EAN-8 check digit for a known reference code', () => {
    expect(computeCheckDigit('4012345')).toBe(5);
  });
});

describe('validateBarcodeValue', () => {
  it('accepts a valid full EAN-13 code', () => {
    expect(validateBarcodeValue('EAN13', '4006381333931').ok).toBe(true);
  });

  it('rejects an EAN-13 code with a wrong check digit', () => {
    expect(validateBarcodeValue('EAN13', '4006381333930').ok).toBe(false);
  });

  it('accepts a 12-digit EAN-13 payload with no check digit', () => {
    expect(validateBarcodeValue('EAN13', '400638133393').ok).toBe(true);
  });

  it('rejects non-digit EAN-13 input', () => {
    expect(validateBarcodeValue('EAN13', '40063813339x').ok).toBe(false);
  });

  it('rejects the wrong length', () => {
    expect(validateBarcodeValue('EAN13', '123').ok).toBe(false);
  });

  it('accepts a valid UPC-A code', () => {
    expect(validateBarcodeValue('UPC', '036000291452').ok).toBe(true);
  });

  it('requires a non-empty value for formats with no checksum', () => {
    expect(validateBarcodeValue('CODE128', '').ok).toBe(false);
    expect(validateBarcodeValue('CODE128', 'HELLO-123').ok).toBe(true);
  });
});
