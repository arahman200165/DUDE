import { formatCodePoint, parseBulkCodePoints, parseCodePointInput } from "./code-point-convert.js";

describe('parseCodePointInput', () => {
  it('parses U+ notation', () => {
    expect(parseCodePointInput('U+0041')).toBe(65);
    expect(parseCodePointInput('u+41')).toBe(65);
  });

  it('parses 0x hex notation', () => {
    expect(parseCodePointInput('0x41')).toBe(65);
  });

  it('parses JS \\u escapes', () => {
    expect(parseCodePointInput('\\u0041')).toBe(65);
    expect(parseCodePointInput('\\u{1F600}')).toBe(0x1f600);
  });

  it('parses HTML entities', () => {
    expect(parseCodePointInput('&#65;')).toBe(65);
    expect(parseCodePointInput('&#x41;')).toBe(65);
    expect(parseCodePointInput('&#x41')).toBe(65);
  });

  it('parses plain decimal', () => {
    expect(parseCodePointInput('65')).toBe(65);
  });

  it('parses a single literal character, including a surrogate-pair one', () => {
    expect(parseCodePointInput('A')).toBe(65);
    expect(parseCodePointInput('😀')).toBe(0x1f600);
  });

  it('returns null for unparseable or multi-character input', () => {
    expect(parseCodePointInput('')).toBeNull();
    expect(parseCodePointInput('not a code point')).toBeNull();
    expect(parseCodePointInput('AB')).toBeNull();
  });

  it('returns null for a code point beyond the valid Unicode range', () => {
    expect(parseCodePointInput('U+110000')).toBeNull();
  });
});

describe('formatCodePoint', () => {
  it('formats every notation for a BMP character', () => {
    expect(formatCodePoint(65)).toEqual({
      codePoint: 65,
      uPlus: 'U+0041',
      decimal: '65',
      htmlDecimal: '&#65;',
      htmlHex: '&#x41;',
      jsEscape: '\\u0041',
      utf8Hex: '41',
    });
  });

  it('formats a multi-byte UTF-8 character', () => {
    expect(formatCodePoint(0xe9).utf8Hex).toBe('C3 A9'); // é
  });

  it('uses the braced \\u{} JS escape for supplementary-plane code points', () => {
    expect(formatCodePoint(0x1f600).jsEscape).toBe('\\u{1F600}');
  });
});

describe('parseBulkCodePoints', () => {
  it('parses a newline- and comma-separated list', () => {
    const result = parseBulkCodePoints('A\nU+0042,0x43');
    expect(result).toHaveLength(3);
    expect(result[0].notations?.codePoint).toBe(65);
    expect(result[1].notations?.codePoint).toBe(66);
    expect(result[2].notations?.codePoint).toBe(67);
  });

  it('reports unparseable tokens as null notations without dropping them', () => {
    const result = parseBulkCodePoints('A\nnot a code point');
    expect(result).toHaveLength(2);
    expect(result[1].token).toBe('not a code point');
    expect(result[1].notations).toBeNull();
  });

  it('returns an empty list for blank input', () => {
    expect(parseBulkCodePoints('')).toEqual([]);
    expect(parseBulkCodePoints('  \n , ')).toEqual([]);
  });
});
