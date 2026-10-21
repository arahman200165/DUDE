import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';
import {
  BARCODE_SYMBOLOGIES,
  barcodeSvgDataUrl,
  normalizeBarcodeSymbology,
  renderBarcodeSvg,
  type BarcodeSymbology,
} from './barcode-render.js';

function hex(text: string): string {
  return Array.from(sha256(new TextEncoder().encode(text)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function ok(result: ReturnType<typeof renderBarcodeSvg>) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
}

describe('renderBarcodeSvg', () => {
  it.each(BARCODE_SYMBOLOGIES.map((info) => [info.id, info.sample] as const))('renders %s with its sample value', (symbology, sample) => {
    const result = ok(renderBarcodeSvg({ symbology, text: sample }));
    expect(result.svg).toContain('<svg');
    expect(result.svg).not.toContain('currentColor');
    expect(result.svg).toContain('fill="#FFFFFF"');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it.each<[BarcodeSymbology, string]>([
    ['code128', 'DUDE-128'],
    ['ean13', '5901234123457'],
    ['datamatrix', 'hello'],
    ['pdf417', 'hello'],
    ['azteccode', 'hello'],
    ['gs1-128', '(01)09506000134352(17)201225(10)ABC123'],
  ])('%s dimensions grow monotonically with scale', (symbology, text) => {
    const small = ok(renderBarcodeSvg({ symbology, text, scale: 1 }));
    const medium = ok(renderBarcodeSvg({ symbology, text, scale: 2 }));
    const large = ok(renderBarcodeSvg({ symbology, text, scale: 4 }));
    expect(medium.width).toBeGreaterThan(small.width);
    expect(large.width).toBeGreaterThan(medium.width);
    expect(large.height).toBeGreaterThan(medium.height);
    expect(medium.height).toBeGreaterThan(small.height);
  });

  it('puts the natural pixel size on the svg root', () => {
    const result = ok(renderBarcodeSvg({ symbology: 'code128', text: 'abc' }));
    expect(result.svg).toContain(`width="${result.width}" height="${result.height}"`);
  });

  it('rejects an EAN-13 with a wrong check digit using the validation message', () => {
    expect(renderBarcodeSvg({ symbology: 'ean13', text: '4006381333930' })).toEqual({
      ok: false,
      error: 'Invalid check digit -- expected 1, got 0.',
    });
  });

  it('keeps the digits-only and length messages', () => {
    expect(renderBarcodeSvg({ symbology: 'upca', text: '12ab' })).toEqual({ ok: false, error: 'UPC values must contain digits only.' });
    expect(renderBarcodeSvg({ symbology: 'ean8', text: '123' })).toEqual({ ok: false, error: 'EAN8 must be 7 digits (check digit optional) or 8 digits.' });
    expect(renderBarcodeSvg({ symbology: 'datamatrix', text: '   ' })).toEqual({ ok: false, error: 'Enter a value.' });
  });

  it('turns encoder errors into friendly messages', () => {
    const bad = renderBarcodeSvg({ symbology: 'itf14', text: '12345' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toBe('ITF-14 must be 13 or 14 digits');
      expect(bad.error).not.toContain('bwipp');
    }
    const gs1 = renderBarcodeSvg({ symbology: 'gs1-128', text: '(01)09506000134351' });
    expect(gs1.ok).toBe(false);
    if (!gs1.ok) expect(gs1.error).toContain('Bad checksum');
    const plain = renderBarcodeSvg({ symbology: 'gs1-128', text: 'hello' });
    expect(plain.ok).toBe(false);
  });

  it('accepts a 12-digit EAN-13 payload and computes the check digit', () => {
    ok(renderBarcodeSvg({ symbology: 'ean13', text: '590123412345' }));
  });

  it('upper-cases Code 39 and wraps Codabar with start/stop characters', () => {
    ok(renderBarcodeSvg({ symbology: 'code39', text: 'abc-123' }));
    ok(renderBarcodeSvg({ symbology: 'codabar', text: '12345' }));
    ok(renderBarcodeSvg({ symbology: 'codabar', text: 'a12345d' }));
  });

  it('omits the human-readable text when asked', () => {
    const withText = ok(renderBarcodeSvg({ symbology: 'code128', text: 'abc' }));
    const without = ok(renderBarcodeSvg({ symbology: 'code128', text: 'abc', includeText: false }));
    expect(without.height).toBeLessThan(withText.height);
  });

  it('rejects over-long values and never throws', () => {
    const result = renderBarcodeSvg({ symbology: 'datamatrix', text: 'x'.repeat(5000) });
    expect(result.ok).toBe(false);
    expect(() => renderBarcodeSvg({ symbology: 'nope' as BarcodeSymbology, text: 'a' })).not.toThrow();
  });

  it('is deterministic and pins the EAN-13 5901234123457 path data', () => {
    const first = ok(renderBarcodeSvg({ symbology: 'ean13', text: '5901234123457' }));
    const second = ok(renderBarcodeSvg({ symbology: 'ean13', text: '5901234123457' }));
    expect(second.svg).toBe(first.svg);
    const paths = [...first.svg.matchAll(/\sd="([^"]*)"/g)].map((match) => match[1]).join('\n');
    expect(hex(paths)).toBe('35e3dd22e97cac18ee76c352c1aa067c6d1ce5a317b9ae7a58b31b994d7fca93');
  });
});

describe('normalizeBarcodeSymbology', () => {
  it('maps the old jsbarcode format names to the new ids', () => {
    expect(normalizeBarcodeSymbology('CODE128')).toBe('code128');
    expect(normalizeBarcodeSymbology('EAN13')).toBe('ean13');
    expect(normalizeBarcodeSymbology('EAN8')).toBe('ean8');
    expect(normalizeBarcodeSymbology('UPC')).toBe('upca');
    expect(normalizeBarcodeSymbology('CODE39')).toBe('code39');
    expect(normalizeBarcodeSymbology('ITF14')).toBe('itf14');
    expect(normalizeBarcodeSymbology('codabar')).toBe('codabar');
  });

  it('accepts the new ids and rejects unknown values', () => {
    for (const info of BARCODE_SYMBOLOGIES) expect(normalizeBarcodeSymbology(info.id)).toBe(info.id);
    expect(normalizeBarcodeSymbology('nope')).toBeNull();
    expect(normalizeBarcodeSymbology(42)).toBeNull();
  });
});

describe('barcodeSvgDataUrl', () => {
  it('round-trips through percent-encoding', () => {
    const result = ok(renderBarcodeSvg({ symbology: 'code128', text: 'abc' }));
    const url = barcodeSvgDataUrl(result.svg);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice('data:image/svg+xml;charset=utf-8,'.length))).toBe(result.svg);
  });
});
