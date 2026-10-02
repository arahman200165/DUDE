import { analyzeCharacters } from "./unicode-char-analyze.js";

describe('analyzeCharacters', () => {
  it('returns one entry per code point for ASCII text', () => {
    const { entries, totalCount, truncated } = analyzeCharacters('AB');
    expect(totalCount).toBe(2);
    expect(truncated).toBe(false);
    expect(entries).toHaveLength(2);
    expect(entries[0].char).toBe('A');
    expect(entries[0].codePointDecimal).toBe(65);
    expect(entries[0].codePointHex).toBe('U+0041');
    expect(entries[0].utf8Bytes).toBe('41');
    expect(entries[0].utf16Units).toBe('0041');
    expect(entries[0].categoryAbbreviation).toBe('Lu');
    expect(entries[0].block).toBe('Basic Latin');
    expect(entries[0].name).toBe('LATIN CAPITAL LETTER A');
  });

  it('encodes a multi-byte UTF-8 character correctly', () => {
    const { entries } = analyzeCharacters('é');
    expect(entries[0].utf8Bytes).toBe('C3 A9');
  });

  it('treats a surrogate-pair character as a single code point, not two', () => {
    const { entries, totalCount } = analyzeCharacters('😀');
    expect(totalCount).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0].char).toBe('😀');
    expect(entries[0].utf16Units).toBe('D83D DE00');
  });

  it('returns no entries for empty input', () => {
    expect(analyzeCharacters('').entries).toEqual([]);
    expect(analyzeCharacters('').totalCount).toBe(0);
  });

  it('caps rendered entries at 2000 and reports truncation', () => {
    const { entries, totalCount, truncated } = analyzeCharacters('a'.repeat(2500));
    expect(totalCount).toBe(2500);
    expect(entries).toHaveLength(2000);
    expect(truncated).toBe(true);
  });
});
