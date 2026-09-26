import fc from 'fast-check';
import { decodeUrl, encodeUrl } from './url-encode-codec';

describe('encodeUrl', () => {
  it('matches the RFC 2397 section 4 percent-escaped data URL example', () => {
    expect(encodeUrl('data:,A brief note', 'full')).toEqual({
      ok: true,
      value: 'data:,A%20brief%20note',
    });
    expect(decodeUrl('data:,A%20brief%20note', 'full')).toEqual({
      ok: true,
      value: 'data:,A brief note',
    });
  });
  it('component mode escapes reserved characters like & and /', () => {
    expect(encodeUrl('a b&c/d', 'component')).toEqual({ ok: true, value: 'a%20b%26c%2Fd' });
  });

  it('full mode preserves URI-reserved characters like / and :', () => {
    expect(encodeUrl('https://example.com/a b', 'full')).toEqual({
      ok: true,
      value: 'https://example.com/a%20b',
    });
  });

  it('round-trips unicode text', () => {
    const encoded = encodeUrl('café ❤', 'component');
    expect(encoded.ok).toBe(true);
  });
});

describe('decodeUrl', () => {
  it('component mode decodes percent-escapes', () => {
    expect(decodeUrl('a%20b%26c', 'component')).toEqual({ ok: true, value: 'a b&c' });
  });

  it('full mode decodes percent-escapes but leaves reserved characters valid', () => {
    expect(decodeUrl('https://example.com/a%20b', 'full')).toEqual({
      ok: true,
      value: 'https://example.com/a b',
    });
  });

  it('rejects malformed percent-encoding', () => {
    expect(decodeUrl('%', 'component')).toEqual({
      ok: false,
      error: 'Invalid percent-encoding in this input.',
    });
  });

  it('rejects an incomplete escape sequence', () => {
    expect(decodeUrl('100% done', 'component')).toEqual({
      ok: false,
      error: 'Invalid percent-encoding in this input.',
    });
  });
});

describe('round-trip property (DUDE_PRD.md §21 Phase 23 Item 4)', () => {
  it('decodeUrl(encodeUrl(x)) === x for both variants, for any well-formed Unicode text', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom('component', 'full') as fc.Arbitrary<'component' | 'full'>, (text, variant) => {
        const encoded = encodeUrl(text, variant);
        expect(encoded.ok).toBe(true);
        if (!encoded.ok) return;
        const decoded = decodeUrl(encoded.value, variant);
        expect(decoded).toEqual({ ok: true, value: text });
      }),
    );
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('decodeUrl never throws for arbitrary text input, in either variant', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom('component', 'full') as fc.Arbitrary<'component' | 'full'>, (text, variant) => {
        expect(() => decodeUrl(text, variant)).not.toThrow();
      }),
    );
  });
});
