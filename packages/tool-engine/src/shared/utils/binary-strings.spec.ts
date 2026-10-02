import { extractAsciiStrings, extractBinaryStrings, extractUtf16LeStrings } from "./binary-strings.js";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

describe('extractAsciiStrings', () => {
  it('finds a printable run at least minLength long', () => {
    const data = bytes(0x00, ...ascii('hello'), 0x00);
    const results = extractAsciiStrings(data, 4);
    expect(results).toEqual([{ offset: 1, text: 'hello', encoding: 'ascii' }]);
  });

  it('ignores runs shorter than minLength', () => {
    const data = bytes(0x00, ...ascii('hi'), 0x00);
    expect(extractAsciiStrings(data, 4)).toEqual([]);
  });

  it('finds multiple separate runs with correct offsets', () => {
    const data = bytes(...ascii('abcd'), 0x00, 0x01, ...ascii('wxyz'));
    const results = extractAsciiStrings(data, 4);
    expect(results).toEqual([
      { offset: 0, text: 'abcd', encoding: 'ascii' },
      { offset: 6, text: 'wxyz', encoding: 'ascii' },
    ]);
  });

  it('treats a run extending to the end of the buffer correctly', () => {
    const data = bytes(0x00, ...ascii('tail'));
    expect(extractAsciiStrings(data, 4)).toEqual([{ offset: 1, text: 'tail', encoding: 'ascii' }]);
  });

  it('returns an empty array for an empty buffer', () => {
    expect(extractAsciiStrings(bytes(), 4)).toEqual([]);
  });
});

describe('extractUtf16LeStrings', () => {
  function utf16le(text: string): number[] {
    const out: number[] = [];
    for (const ch of text) out.push(ch.charCodeAt(0), 0x00);
    return out;
  }

  it('finds a little-endian UTF-16 run', () => {
    const data = bytes(0x00, 0x00, ...utf16le('hi!!'));
    expect(extractUtf16LeStrings(data, 4)).toEqual([{ offset: 2, text: 'hi!!', encoding: 'utf16le' }]);
  });

  it('ignores runs shorter than minLength', () => {
    const data = bytes(...utf16le('ab'));
    expect(extractUtf16LeStrings(data, 4)).toEqual([]);
  });

  it('does not misfire on plain ASCII text with no interleaved zero bytes', () => {
    expect(extractUtf16LeStrings(bytes(...ascii('hello world')), 4)).toEqual([]);
  });
});

describe('extractBinaryStrings', () => {
  it('merges ASCII and UTF-16LE results sorted by offset', () => {
    const data = bytes(...ascii('abcd'), 0x00, 0x00, 0x00, ...ascii('e'), 0x00, ...ascii('f'), 0x00, ...ascii('g'), 0x00, ...ascii('h'), 0x00);
    const results = extractBinaryStrings(data, 4);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) expect(results[i].offset).toBeGreaterThanOrEqual(results[i - 1].offset);
  });
});
