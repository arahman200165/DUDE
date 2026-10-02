import { chunkIntoRows, formatHexByte, isPrintableAsciiByte, parseHexByte, setByteAt } from "./hex-editor-logic.js";

describe('parseHexByte', () => {
  it('parses a two-digit hex value', () => {
    expect(parseHexByte('ff')).toBe(255);
  });

  it('parses a single-digit hex value', () => {
    expect(parseHexByte('a')).toBe(10);
  });

  it('is case-insensitive', () => {
    expect(parseHexByte('FF')).toBe(255);
  });

  it('rejects non-hex input', () => {
    expect(parseHexByte('zz')).toBeNull();
  });

  it('rejects more than two digits', () => {
    expect(parseHexByte('123')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(parseHexByte('')).toBeNull();
  });
});

describe('formatHexByte', () => {
  it('pads a single-digit value to two characters', () => {
    expect(formatHexByte(0x0a)).toBe('0a');
  });

  it('formats 255 as ff', () => {
    expect(formatHexByte(255)).toBe('ff');
  });
});

describe('isPrintableAsciiByte', () => {
  it('treats space through tilde as printable', () => {
    expect(isPrintableAsciiByte(0x20)).toBe(true);
    expect(isPrintableAsciiByte(0x7e)).toBe(true);
  });

  it('treats control characters and high bytes as non-printable', () => {
    expect(isPrintableAsciiByte(0x0a)).toBe(false);
    expect(isPrintableAsciiByte(0xff)).toBe(false);
  });
});

describe('setByteAt', () => {
  it('returns a new array with the byte replaced', () => {
    const original = new Uint8Array([1, 2, 3]);
    const updated = setByteAt(original, 1, 0xff);
    expect(Array.from(updated)).toEqual([1, 0xff, 3]);
    expect(Array.from(original)).toEqual([1, 2, 3]);
  });

  it('throws for an out-of-range index', () => {
    expect(() => setByteAt(new Uint8Array([1, 2]), 5, 0)).toThrow();
  });

  it('throws for a value outside 0-255', () => {
    expect(() => setByteAt(new Uint8Array([1, 2]), 0, 256)).toThrow();
  });
});

describe('chunkIntoRows', () => {
  it('splits bytes into fixed-width rows with correct offsets', () => {
    const rows = chunkIntoRows(new Uint8Array([1, 2, 3, 4, 5]), 2);
    expect(rows).toEqual([
      { offset: 0, bytes: [1, 2] },
      { offset: 2, bytes: [3, 4] },
      { offset: 4, bytes: [5] },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunkIntoRows(new Uint8Array(), 16)).toEqual([]);
  });

  it('throws for a non-positive row width', () => {
    expect(() => chunkIntoRows(new Uint8Array([1]), 0)).toThrow();
  });
});
