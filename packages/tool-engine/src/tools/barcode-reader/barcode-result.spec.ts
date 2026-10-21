import { describe, expect, it } from 'vitest';
import { barcodeSymbologyLabel, interpretBarcode, isTwoDimensionalSymbology, normalizeBarcodeFormat, verifyGs1CheckDigit } from './barcode-result.js';

describe('normalizeBarcodeFormat', () => {
  it('maps ZXing, vision-camera/ML Kit and AVFoundation names to one symbology', () => {
    expect(normalizeBarcodeFormat('EAN_13')).toBe('ean13');
    expect(normalizeBarcodeFormat('ean-13')).toBe('ean13');
    expect(normalizeBarcodeFormat('org.gs1.EAN-13')).toBe('ean13');
    expect(normalizeBarcodeFormat('UPC_A')).toBe('upca');
    expect(normalizeBarcodeFormat('UPC_E')).toBe('upce');
    expect(normalizeBarcodeFormat('CODE_128')).toBe('code128');
    expect(normalizeBarcodeFormat('code128')).toBe('code128');
    expect(normalizeBarcodeFormat('QR_CODE')).toBe('qr');
    expect(normalizeBarcodeFormat('qr')).toBe('qr');
    expect(normalizeBarcodeFormat('DATA_MATRIX')).toBe('datamatrix');
    expect(normalizeBarcodeFormat('PDF_417')).toBe('pdf417');
    expect(normalizeBarcodeFormat('RSS_14')).toBe('gs1-databar');
    expect(normalizeBarcodeFormat('RSS_EXPANDED')).toBe('gs1-databar-expanded');
    expect(normalizeBarcodeFormat('ITF')).toBe('itf');
  });

  it('returns unknown for missing or unrecognised names', () => {
    expect(normalizeBarcodeFormat(undefined)).toBe('unknown');
    expect(normalizeBarcodeFormat(null)).toBe('unknown');
    expect(normalizeBarcodeFormat('')).toBe('unknown');
    expect(normalizeBarcodeFormat('MADE_UP')).toBe('unknown');
  });

  it('exposes labels and dimensionality', () => {
    expect(barcodeSymbologyLabel('ean13')).toBe('EAN-13');
    expect(isTwoDimensionalSymbology('qr')).toBe(true);
    expect(isTwoDimensionalSymbology('code128')).toBe(false);
  });
});

describe('verifyGs1CheckDigit', () => {
  it('validates the reference EAN-13, UPC-A, EAN-8 and ITF-14 codes', () => {
    expect(verifyGs1CheckDigit('ean13', '4006381333931')).toEqual({ valid: true, expected: 1, actual: 1 });
    expect(verifyGs1CheckDigit('upca', '036000291452')).toMatchObject({ valid: true });
    expect(verifyGs1CheckDigit('ean8', '40123455')).toMatchObject({ valid: true });
    expect(verifyGs1CheckDigit('itf14', '10012345678902')).toMatchObject({ valid: true });
  });

  it('reports the expected digit on mismatch', () => {
    expect(verifyGs1CheckDigit('ean13', '4006381333932')).toEqual({ valid: false, expected: 1, actual: 2 });
  });

  it('returns null for non-GS1 symbologies, wrong lengths and non-digits', () => {
    expect(verifyGs1CheckDigit('code128', '4006381333931')).toBeNull();
    expect(verifyGs1CheckDigit('ean13', '400638133393')).toBeNull();
    expect(verifyGs1CheckDigit('ean13', '40063813339A1')).toBeNull();
  });
});

describe('interpretBarcode', () => {
  it('interprets a valid EAN-13 and derives the GTIN-14', () => {
    const result = interpretBarcode('4006381333931', 'EAN_13');
    expect(result).toMatchObject({ symbology: 'ean13', label: 'EAN-13', twoDimensional: false, gtin14: '04006381333931', isbn13: null, sensitive: false });
    expect(result.checkDigit?.valid).toBe(true);
    expect(result.payload.kind).toBe('text');
  });

  it('flags an invalid check digit and withholds the GTIN', () => {
    const result = interpretBarcode('4006381333932', 'ean13');
    expect(result.checkDigit).toEqual({ valid: false, expected: 1, actual: 2 });
    expect(result.gtin14).toBeNull();
  });

  it('pads UPC-A and recognises ISBN-13', () => {
    expect(interpretBarcode('036000291452', 'UPC_A').gtin14).toBe('00036000291452');
    expect(interpretBarcode('9780306406157', 'EAN_13').isbn13).toBe('9780306406157');
    expect(interpretBarcode('9780306406158', 'EAN_13').isbn13).toBeNull();
  });

  it('treats a 14-digit ITF value as a GTIN-14', () => {
    expect(interpretBarcode('10012345678902', 'ITF')).toMatchObject({ gtin14: '10012345678902' });
  });

  it('skips check digits for Code 128 and unknown formats', () => {
    expect(interpretBarcode('ABC-123', 'CODE_128')).toMatchObject({ checkDigit: null, gtin14: null, symbology: 'code128' });
    expect(interpretBarcode('4006381333931')).toMatchObject({ symbology: 'unknown', label: 'Unknown', checkDigit: null });
  });

  it('classifies the payload of 2D symbologies and propagates sensitivity', () => {
    const wifi = interpretBarcode('WIFI:T:WPA;S:Net;P:secret;;', 'QR_CODE');
    expect(wifi).toMatchObject({ symbology: 'qr', twoDimensional: true, sensitive: true });
    expect(wifi.payload.kind).toBe('wifi');
    expect(interpretBarcode('https://example.com', 'qr').payload.kind).toBe('url');
  });
});
