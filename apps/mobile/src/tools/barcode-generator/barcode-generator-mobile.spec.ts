import { describe, expect, it } from 'vitest';
import { decodeFormat, decodeScale, fileNameFor, previewSize, valueAfterSymbologyChange } from './barcode-generator-mobile';

describe('barcode-generator mobile helpers', () => {
  it('decodes persisted formats like the web tool, including legacy names', () => {
    expect([decodeFormat('ean13'), decodeFormat('CODE128'), decodeFormat('UPC'), decodeFormat('aztec'), decodeFormat('nope'), decodeFormat(3)]).toEqual(['ean13', 'code128', 'upca', 'azteccode', null, null]);
  });
  it('accepts only the offered scales', () => {
    expect([decodeScale(2), decodeScale(5), decodeScale('2')]).toEqual([2, null, null]);
  });
  it('offers the sample of the new symbology only while the value is empty or another sample', () => {
    expect(valueAfterSymbologyChange('123456789012', 'ean13')).toBe('5901234123457');
    expect(valueAfterSymbologyChange('  ', 'code39')).toBe('CODE39');
    expect(valueAfterSymbologyChange('my own value', 'ean13')).toBeNull();
  });
  it('enlarges small barcodes up to 3x and shrinks wide ones to the available width', () => {
    expect(previewSize(88, 88, 400)).toEqual({ width: 264, height: 264 });
    expect(previewSize(252, 144, 200)).toEqual({ width: 200, height: 114 });
  });
  it('names exports by symbology', () => {
    expect(fileNameFor('gs1-128', 'png')).toBe('barcode-gs1-128.png');
  });
});
