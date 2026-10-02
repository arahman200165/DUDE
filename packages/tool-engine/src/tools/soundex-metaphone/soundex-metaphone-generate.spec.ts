import { generatePhoneticCodes } from "./soundex-metaphone-generate.js";

describe('generatePhoneticCodes', () => {
  it('computes soundex and metaphone for each word', () => {
    const [entry] = generatePhoneticCodes('Robert');
    expect(entry.word).toBe('Robert');
    expect(entry.soundex).toBe('R163');
    expect(entry.metaphone).toBe('RBRT');
  });

  it('gives Robert and Rupert the same soundex code (the classic textbook example)', () => {
    const [robert, rupert] = generatePhoneticCodes('Robert\nRupert');
    expect(robert.soundex).toBe(rupert.soundex);
  });

  it('splits on newlines and commas', () => {
    const result = generatePhoneticCodes('Robert, Rupert\nAshcraft');
    expect(result.map((r) => r.word)).toEqual(['Robert', 'Rupert', 'Ashcraft']);
  });

  it('ignores blank entries', () => {
    expect(generatePhoneticCodes('Robert,,  \n')).toHaveLength(1);
  });

  it('returns an empty list for blank input', () => {
    expect(generatePhoneticCodes('')).toEqual([]);
  });
});
