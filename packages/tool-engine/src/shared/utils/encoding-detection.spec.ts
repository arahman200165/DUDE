import { detectBom, detectEncoding, isAscii, isValidUtf8, stripBom } from "./encoding-detection.js";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe('detectBom', () => {
  it('detects a UTF-8 BOM', () => {
    expect(detectBom(bytes(0xef, 0xbb, 0xbf, 0x41))).toEqual({ encoding: 'utf-8', length: 3 });
  });

  it('detects a UTF-16LE BOM', () => {
    expect(detectBom(bytes(0xff, 0xfe, 0x41, 0x00))).toEqual({ encoding: 'utf-16le', length: 2 });
  });

  it('detects a UTF-16BE BOM', () => {
    expect(detectBom(bytes(0xfe, 0xff, 0x00, 0x41))).toEqual({ encoding: 'utf-16be', length: 2 });
  });

  it('prefers the longer UTF-32LE BOM over the UTF-16LE prefix it contains', () => {
    expect(detectBom(bytes(0xff, 0xfe, 0x00, 0x00, 0x41))).toEqual({ encoding: 'utf-32le', length: 4 });
  });

  it('detects a UTF-32BE BOM', () => {
    expect(detectBom(bytes(0x00, 0x00, 0xfe, 0xff))).toEqual({ encoding: 'utf-32be', length: 4 });
  });

  it('returns null when no BOM is present', () => {
    expect(detectBom(bytes(0x41, 0x42, 0x43))).toBeNull();
  });

  it('returns null for a buffer shorter than any BOM', () => {
    expect(detectBom(bytes(0xff))).toBeNull();
  });
});

describe('stripBom', () => {
  it('removes a detected BOM', () => {
    const stripped = stripBom(bytes(0xef, 0xbb, 0xbf, 0x41, 0x42));
    expect(Array.from(stripped)).toEqual([0x41, 0x42]);
  });

  it('returns the input unchanged when there is no BOM', () => {
    const input = bytes(0x41, 0x42);
    expect(Array.from(stripBom(input))).toEqual([0x41, 0x42]);
  });
});

describe('isAscii / isValidUtf8', () => {
  it('recognizes pure ASCII', () => {
    expect(isAscii(new TextEncoder().encode('hello'))).toBe(true);
  });

  it('rejects a byte above 0x7f as non-ASCII', () => {
    expect(isAscii(bytes(0x41, 0xff))).toBe(false);
  });

  it('validates well-formed UTF-8', () => {
    expect(isValidUtf8(new TextEncoder().encode('héllo'))).toBe(true);
  });

  it('rejects a truncated multi-byte UTF-8 sequence', () => {
    expect(isValidUtf8(bytes(0xe2, 0x82))).toBe(false);
  });
});

describe('detectEncoding', () => {
  it('reports high confidence for a BOM-prefixed file', () => {
    const result = detectEncoding(bytes(0xef, 0xbb, 0xbf, 0x41));
    expect(result.guess).toBe('utf-8 (with BOM)');
    expect(result.confidence).toBe('high');
  });

  it('reports ascii with high confidence for plain ASCII text', () => {
    const result = detectEncoding(new TextEncoder().encode('hello world'));
    expect(result.guess).toBe('ascii');
    expect(result.confidence).toBe('high');
  });

  it('reports utf-8 with medium confidence for valid non-ASCII UTF-8', () => {
    const result = detectEncoding(new TextEncoder().encode('héllo wörld'));
    expect(result.guess).toBe('utf-8');
    expect(result.confidence).toBe('medium');
  });

  it('falls back to a low-confidence windows-1252 guess for invalid UTF-8', () => {
    const result = detectEncoding(bytes(0x41, 0xff, 0xfe, 0x00, 0x01));
    expect(result.guess).toBe('windows-1252 (best guess)');
    expect(result.confidence).toBe('low');
  });
});
