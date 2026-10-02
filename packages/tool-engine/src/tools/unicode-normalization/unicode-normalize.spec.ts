import { normalizeText } from "./unicode-normalize.js";

describe('normalizeText', () => {
  it('composes a combining-character sequence under NFC', () => {
    const decomposed = 'é'; // e + combining acute accent
    const result = normalizeText(decomposed, 'NFC');
    expect(result.output).toBe('é'); // é
    expect(result.changed).toBe(true);
    expect(result.outputCodePointCount).toBe(1);
    expect(result.inputCodePointCount).toBe(2);
  });

  it('decomposes a precomposed character under NFD', () => {
    const result = normalizeText('é', 'NFD');
    expect(result.output).toBe('é');
    expect(result.changed).toBe(true);
  });

  it('reports unchanged when already normalized', () => {
    const result = normalizeText('hello', 'NFC');
    expect(result.changed).toBe(false);
    expect(result.output).toBe('hello');
  });

  it('applies compatibility folding under NFKC', () => {
    const result = normalizeText('Ⅰ', 'NFKC'); // ROMAN NUMERAL ONE
    expect(result.output).toBe('I');
    expect(result.changed).toBe(true);
  });

  it('handles empty input', () => {
    const result = normalizeText('', 'NFC');
    expect(result.output).toBe('');
    expect(result.changed).toBe(false);
    expect(result.inputCodePointCount).toBe(0);
  });
});
