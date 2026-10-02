import { DEFAULT_SMART_QUOTES_OPTIONS, normalizeSmartQuotes } from "./smart-quotes-normalize.js";

describe('normalizeSmartQuotes — to-straight', () => {
  const options = { ...DEFAULT_SMART_QUOTES_OPTIONS, direction: 'to-straight' as const };

  it('converts curly double and single quotes to straight', () => {
    expect(normalizeSmartQuotes('“hello” and ‘world’', options)).toBe('"hello" and \'world\'');
  });

  it('converts em and en dashes to hyphens', () => {
    expect(normalizeSmartQuotes('a—b–c', options)).toBe('a--b-c');
  });

  it('converts an ellipsis character to three dots', () => {
    expect(normalizeSmartQuotes('wait…', options)).toBe('wait...');
  });

  it('respects disabled punctuation classes', () => {
    const quotesOnly = { ...options, dashes: false, ellipsis: false };
    expect(normalizeSmartQuotes('“a”—…', quotesOnly)).toBe('"a"—…');
  });

  it('leaves already-straight text unchanged', () => {
    expect(normalizeSmartQuotes('"hello" -- world...', options)).toBe('"hello" -- world...');
  });
});

describe('normalizeSmartQuotes — to-curly', () => {
  const options = { ...DEFAULT_SMART_QUOTES_OPTIONS, direction: 'to-curly' as const };

  it('curls double quotes around a phrase', () => {
    expect(normalizeSmartQuotes('"hello" and "world"', options)).toBe('“hello” and “world”');
  });

  it('treats a mid-word apostrophe as a closing curl, not an opening quote', () => {
    expect(normalizeSmartQuotes("don't", options)).toBe('don’t');
  });

  it('curls a single-quoted phrase', () => {
    expect(normalizeSmartQuotes("'quoted text'", options)).toBe('‘quoted text’');
  });

  it('converts a double hyphen to an em dash', () => {
    expect(normalizeSmartQuotes('a--b', options)).toBe('a—b');
  });

  it('converts three dots to an ellipsis character', () => {
    expect(normalizeSmartQuotes('wait...', options)).toBe('wait…');
  });
});
