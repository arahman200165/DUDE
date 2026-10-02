import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { convertHexText } from "./hex-text-convert.js";

describe('convertHexText', () => {
  it.each([
    ['f', '66'],
    ['fo', '666f'],
    ['foo', '666f6f'],
    ['foob', '666f6f62'],
    ['fooba', '666f6f6261'],
    ['foobar', '666f6f626172'],
  ])('matches RFC 4648 Section 10 Base16 vector %s', (text, hex) => {
    expect(convertHexText(text, 'toHex', 'ascii')).toEqual({ ok: true, value: hex });
    expect(convertHexText(hex, 'toText', 'ascii')).toEqual({ ok: true, value: text });
  });

  it('encodes ASCII text to hex and back', () => {
    const toHex = convertHexText('Hi!', 'toHex', 'ascii');
    expect(toHex).toEqual({ ok: true, value: '486921' });

    const toText = convertHexText('486921', 'toText', 'ascii');
    expect(toText).toEqual({ ok: true, value: 'Hi!' });
  });

  it('round-trips UTF-8 multi-byte characters', () => {
    const toHex = convertHexText('café', 'toHex', 'utf8');
    expect(toHex.ok).toBe(true);
    const toText = toHex.ok ? convertHexText(toHex.value, 'toText', 'utf8') : null;
    expect(toText).toEqual({ ok: true, value: 'café' });
  });

  it('round-trips through UTF-16LE and UTF-16BE', () => {
    const le = convertHexText('AB', 'toHex', 'utf16le');
    expect(le).toEqual({ ok: true, value: '41004200' });
    expect(convertHexText('41004200', 'toText', 'utf16le')).toEqual({ ok: true, value: 'AB' });

    const be = convertHexText('AB', 'toHex', 'utf16be');
    expect(be).toEqual({ ok: true, value: '00410042' });
    expect(convertHexText('00410042', 'toText', 'utf16be')).toEqual({ ok: true, value: 'AB' });
  });

  it('rejects non-ASCII text in ascii mode', () => {
    expect(convertHexText('café', 'toHex', 'ascii').ok).toBe(false);
  });

  it('rejects invalid hex when decoding', () => {
    expect(convertHexText('zz', 'toText', 'ascii').ok).toBe(false);
  });
});

describe('round-trip property (DUDE_PRD.md §21 Phase 23 Item 4)', () => {
  // hexToBytes treats a blank string as "no input" (an error), not "zero bytes" -- a documented,
  // deliberate UX choice shared with base-n-codec's decoders -- so toText('', ...) never recovers
  // an original empty string via this round-trip; that's the input this property excludes.
  const asciiText = fc.array(fc.integer({ min: 0, max: 127 }), { minLength: 1 }).map((codes) => String.fromCharCode(...codes));
  // Lone surrogates can't be represented in strict UTF-8 -- TextEncoder replaces them with U+FFFD
  // (WHATWG Encoding spec), which is a platform limitation of the utf8 mode, not a bug here.
  const wellFormedText = fc
    .string()
    .filter((s) => s !== '' && (!/[\uD800-\uDFFF]/.test(s) || /^(?:[^\uD800-\uDFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/.test(s)));

  it('round-trips through toHex -> toText in ascii mode for arbitrary ASCII text', () => {
    fc.assert(
      fc.property(asciiText, (text) => {
        const toHex = convertHexText(text, 'toHex', 'ascii');
        expect(toHex.ok).toBe(true);
        if (!toHex.ok) return;
        expect(convertHexText(toHex.value, 'toText', 'ascii')).toEqual({ ok: true, value: text });
      }),
    );
  });

  it('round-trips through toHex -> toText in utf8 mode for arbitrary well-formed text', () => {
    fc.assert(
      fc.property(wellFormedText, (text) => {
        const toHex = convertHexText(text, 'toHex', 'utf8');
        expect(toHex.ok).toBe(true);
        if (!toHex.ok) return;
        expect(convertHexText(toHex.value, 'toText', 'utf8')).toEqual({ ok: true, value: text });
      }),
    );
  });

  it('round-trips through toHex -> toText in utf16le/utf16be mode for arbitrary text', () => {
    fc.assert(
      fc.property(fc.string().filter((s) => s !== ''), fc.constantFrom('utf16le', 'utf16be') as fc.Arbitrary<'utf16le' | 'utf16be'>, (text, encoding) => {
        const toHex = convertHexText(text, 'toHex', encoding);
        expect(toHex.ok).toBe(true);
        if (!toHex.ok) return;
        expect(convertHexText(toHex.value, 'toText', encoding)).toEqual({ ok: true, value: text });
      }),
    );
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input, in any direction/encoding', () => {
    const encoding = fc.constantFrom('ascii', 'utf8', 'utf16le', 'utf16be') as fc.Arbitrary<'ascii' | 'utf8' | 'utf16le' | 'utf16be'>;
    const direction = fc.constantFrom('toHex', 'toText') as fc.Arbitrary<'toHex' | 'toText'>;
    fc.assert(
      fc.property(fc.string(), direction, encoding, (input, dir, enc) => {
        expect(() => convertHexText(input, dir, enc)).not.toThrow();
      }),
    );
  });
});
