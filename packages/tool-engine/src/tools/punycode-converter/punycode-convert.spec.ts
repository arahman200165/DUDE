import { describe, expect, it } from 'vitest';
import { convertPunycode } from "./punycode-convert.js";

describe('convertPunycode', () => {
  it('converts a Unicode domain to its Punycode ASCII form', () => {
    expect(convertPunycode('münchen.de', 'toASCII')).toEqual({ ok: true, value: 'xn--mnchen-3ya.de' });
  });

  it('converts a Punycode ASCII domain back to Unicode', () => {
    expect(convertPunycode('xn--mnchen-3ya.de', 'toUnicode')).toEqual({ ok: true, value: 'münchen.de' });
  });

  it('round-trips a multi-label internationalized domain', () => {
    const original = 'bücher.example.com';
    const ascii = convertPunycode(original, 'toASCII');
    expect(ascii.ok).toBe(true);
    expect(ascii.ok && convertPunycode(ascii.value, 'toUnicode')).toEqual({ ok: true, value: original });
  });

  it('leaves an already-ASCII domain unchanged going to ASCII', () => {
    expect(convertPunycode('example.com', 'toASCII')).toEqual({ ok: true, value: 'example.com' });
  });

  it('rejects empty input', () => {
    expect(convertPunycode('', 'toASCII').ok).toBe(false);
    expect(convertPunycode('   ', 'toUnicode').ok).toBe(false);
  });
});
