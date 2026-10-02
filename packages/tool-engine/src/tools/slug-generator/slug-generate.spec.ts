import { DEFAULT_SLUG_OPTIONS, generateSlug } from "./slug-generate.js";

describe('generateSlug', () => {
  it('slugifies basic text', () => {
    expect(generateSlug('Hello World Example', DEFAULT_SLUG_OPTIONS)).toBe('hello-world-example');
  });

  it('transliterates diacritics', () => {
    expect(generateSlug('Déjà Vu!', DEFAULT_SLUG_OPTIONS)).toBe('deja-vu');
  });

  it('uses an underscore separator when requested', () => {
    expect(generateSlug('Hello World', { ...DEFAULT_SLUG_OPTIONS, separator: '_' })).toBe('hello_world');
  });

  it('collapses repeated whitespace', () => {
    expect(generateSlug('  multiple   spaces  ', DEFAULT_SLUG_OPTIONS)).toBe('multiple-spaces');
  });

  it('returns an empty string for empty input', () => {
    expect(generateSlug('', DEFAULT_SLUG_OPTIONS)).toBe('');
  });

  it('removes stopwords when enabled', () => {
    expect(generateSlug('The Quick Brown Fox and the Lazy Dog', { ...DEFAULT_SLUG_OPTIONS, removeStopwords: true })).toBe(
      'quick-brown-fox-lazy-dog',
    );
  });

  it('keeps stopwords when disabled', () => {
    expect(generateSlug('The Quick Brown Fox', { ...DEFAULT_SLUG_OPTIONS, removeStopwords: false })).toBe(
      'the-quick-brown-fox',
    );
  });

  it('truncates to maxLength at a separator boundary', () => {
    expect(generateSlug('one two three four five', { ...DEFAULT_SLUG_OPTIONS, maxLength: 13 })).toBe('one-two-three');
  });

  it('does not truncate mid-word', () => {
    const result = generateSlug('one two three four five', { ...DEFAULT_SLUG_OPTIONS, maxLength: 10 });
    expect(result.endsWith('-')).toBe(false);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('leaves the slug untouched when maxLength is null', () => {
    expect(generateSlug('one two three four five', { ...DEFAULT_SLUG_OPTIONS, maxLength: null })).toBe(
      'one-two-three-four-five',
    );
  });
});
