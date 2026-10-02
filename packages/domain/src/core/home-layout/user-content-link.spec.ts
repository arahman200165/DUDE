import { describe, expect, it } from 'vitest';
import { MAX_LABEL_CHARS, MAX_URL_CHARS, normalizeExternalUrl, validateLink } from "./user-content.model.js";

describe('normalizeExternalUrl', () => {
  it('accepts http and https and returns the normalized href', () => {
    expect(normalizeExternalUrl(' https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1');
    expect(normalizeExternalUrl('http://localhost:4200')).toBe('http://localhost:4200/');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///C:/secrets.txt', 'ftp://example.com', 'mailto:a@b.co', '//example.com', 'example.com', ''])(
    'rejects %s',
    (value) => {
      expect(normalizeExternalUrl(value)).toBeNull();
    },
  );

  it('rejects embedded credentials and over-long URLs', () => {
    expect(normalizeExternalUrl('https://user:pass@example.com')).toBeNull();
    expect(normalizeExternalUrl('https://user@example.com')).toBeNull();
    expect(normalizeExternalUrl(`https://example.com/${'a'.repeat(MAX_URL_CHARS)}`)).toBeNull();
  });
});

describe('validateLink', () => {
  it('trims and bounds the label, falling back to the host when blank', () => {
    expect(validateLink('  Docs  ', 'https://example.com')).toEqual({ ok: true, link: { label: 'Docs', url: 'https://example.com/' } });
    expect(validateLink('   ', 'https://example.com/x')).toEqual({ ok: true, link: { label: 'example.com', url: 'https://example.com/x' } });
    const long = validateLink('x'.repeat(200), 'https://example.com');
    expect(long.ok && long.link.label.length).toBe(MAX_LABEL_CHARS);
  });

  it('returns an error for an unsafe address', () => {
    expect(validateLink('Bad', 'javascript:alert(1)')).toMatchObject({ ok: false });
  });
});
