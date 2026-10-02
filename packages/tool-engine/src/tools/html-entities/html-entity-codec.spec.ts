import fc from 'fast-check';
import { decodeHtmlEntities, encodeHtmlEntities } from "./html-entity-codec.js";

describe('decodeHtmlEntities', () => {
  it('decodes named entities', () => {
    expect(decodeHtmlEntities('&amp;&lt;&gt;&quot;')).toBe('&<>"');
  });

  it('decodes decimal numeric entities', () => {
    expect(decodeHtmlEntities('&#39;')).toBe("'");
  });

  it('decodes hexadecimal numeric entities', () => {
    expect(decodeHtmlEntities('&#x27;')).toBe("'");
  });

  it('decodes accented-letter named entities', () => {
    expect(decodeHtmlEntities('Caf&eacute;')).toBe('Café');
  });

  it('leaves plain text unchanged', () => {
    expect(decodeHtmlEntities('hello world')).toBe('hello world');
  });

  it('handles empty input', () => {
    expect(decodeHtmlEntities('')).toBe('');
  });
});

describe('encodeHtmlEntities', () => {
  it('escapes &, <, and >', () => {
    expect(encodeHtmlEntities('<b>a & b</b>', false)).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;');
  });

  it('leaves quotes untouched in text content', () => {
    expect(encodeHtmlEntities('say "hi"', false)).toBe('say "hi"');
  });

  it('leaves non-ASCII characters untouched by default', () => {
    expect(encodeHtmlEntities('café', false)).toBe('café');
  });

  it('encodes non-ASCII characters as numeric entities when requested', () => {
    expect(encodeHtmlEntities('café', true)).toBe('caf&#233;');
  });

  it('round-trips through decode', () => {
    const original = '<div class="a">Tom & Jerry</div>';
    expect(decodeHtmlEntities(encodeHtmlEntities(original, false))).toBe(original);
  });

  it('handles empty input', () => {
    expect(encodeHtmlEntities('', false)).toBe('');
  });
});

describe('round-trip property (DUDE_PRD.md §21 Phase 23 Item 4)', () => {
  // Lone surrogates are not well-formed Unicode text and the DOM's own text APIs
  // (textContent/innerHTML) normalize them inconsistently across engines -- excluded here as a
  // platform limitation, not a bug in this thin wrapper.
  const wellFormedText = fc.string().filter((s) => !/[\uD800-\uDFFF]/.test(s) || /^(?:[^\uD800-\uDFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/.test(s));

  it('decodeHtmlEntities(encodeHtmlEntities(x, false)) === x for arbitrary well-formed text', () => {
    fc.assert(
      fc.property(wellFormedText, (text) => {
        expect(decodeHtmlEntities(encodeHtmlEntities(text, false))).toBe(text);
      }),
    );
  });

  it('decodeHtmlEntities(encodeHtmlEntities(x, true)) === x for arbitrary well-formed text', () => {
    fc.assert(
      fc.property(wellFormedText, (text) => {
        expect(decodeHtmlEntities(encodeHtmlEntities(text, true))).toBe(text);
      }),
    );
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('decodeHtmlEntities never throws for arbitrary text input', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(() => decodeHtmlEntities(text)).not.toThrow();
      }),
    );
  });
});
