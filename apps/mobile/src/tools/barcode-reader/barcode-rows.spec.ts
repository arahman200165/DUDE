import { describe, expect, it } from 'vitest';
import { interpretBarcode } from '@dude/tool-engine/tools/barcode-reader/barcode-result';
import { barcodeRows } from './barcode-rows';

const byKey = (value: string, format: string) => Object.fromEntries(barcodeRows(interpretBarcode(value, format)).map(row => [row.key, row.value]));

describe('barcodeRows', () => {
  it('reports a valid EAN-13 with its GTIN-14', () => {
    expect(byKey('4006381333931', 'ean13')).toEqual({ format: 'EAN-13 (1D)', 'check-digit': 'Valid (1)', gtin14: '04006381333931' });
  });
  it('reports an invalid check digit without a GTIN', () => {
    expect(byKey('4006381333932', 'ean13')).toEqual({ format: 'EAN-13 (1D)', 'check-digit': 'Invalid (expected 1, found 2)' });
  });
  it('adds the ISBN-13 for 978 prefixes', () => {
    expect(byKey('9780306406157', 'ean13').isbn13).toBe('9780306406157');
  });
  it('explains a wrong-length GS1 value and omits the row for other symbologies', () => {
    expect(byKey('40063813339', 'ean13')['check-digit']).toBe('Not checked (needs 13 digits)');
    expect(byKey('ABC-123', 'code128')).toEqual({ format: 'Code 128 (1D)' });
  });
  it('maps expo-camera type names', () => {
    expect(byKey('036000291452', 'upc_a').gtin14).toBe('00036000291452');
    expect(byKey('x', 'qr').format).toBe('QR Code (2D)');
  });
});
