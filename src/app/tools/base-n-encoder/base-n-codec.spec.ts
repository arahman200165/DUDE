import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BASE_N_MODES, BaseNMode, decodeToBytes, encodeBytes } from './base-n-codec';

const SAMPLE = new TextEncoder().encode('The quick brown fox jumps over the lazy dog!');

describe('encodeBytes / decodeToBytes round-trip', () => {
  for (const { id } of BASE_N_MODES) {
    it(`round-trips arbitrary bytes through ${id}`, () => {
      const encoded = encodeBytes(SAMPLE, id);
      const decoded = decodeToBytes(encoded, id);
      expect(decoded.ok && Array.from(decoded.value)).toEqual(Array.from(SAMPLE));
    });
  }

  it('round-trips leading zero bytes (the classic Base58 edge case)', () => {
    const withLeadingZeros = new Uint8Array([0, 0, 0, 1, 2, 3]);
    for (const mode of ['base58', 'base62', 'base36'] as const satisfies readonly BaseNMode[]) {
      const encoded = encodeBytes(withLeadingZeros, mode);
      const decoded = decodeToBytes(encoded, mode);
      expect(decoded.ok && Array.from(decoded.value)).toEqual(Array.from(withLeadingZeros));
    }
  });
});

describe('Base85 known vector', () => {
  it('matches the canonical Adobe ASCII85 example', () => {
    const bytes = new TextEncoder().encode('Man ');
    expect(encodeBytes(bytes, 'base85')).toBe('9jqo^');
    const decoded = decodeToBytes('9jqo^', 'base85');
    expect(decoded.ok && new TextDecoder().decode(decoded.value)).toBe('Man ');
  });
});

describe('RFC 4648 section 10 known vectors', () => {
  it('matches the published Base16 and Base32 test vectors', () => {
    const vectors = [
      ['f', '66', 'MY======'],
      ['fo', '666F', 'MZXQ===='],
      ['foo', '666F6F', 'MZXW6==='],
      ['foob', '666F6F62', 'MZXW6YQ='],
      ['fooba', '666F6F6261', 'MZXW6YTB'],
      ['foobar', '666F6F626172', 'MZXW6YTBOI======'],
    ] as const;

    for (const [input, base16, base32] of vectors) {
      const bytes = new TextEncoder().encode(input);
      // RFC 4648 defines Base16 as case-insensitive; this codec emits lowercase.
      expect(encodeBytes(bytes, 'base16').toUpperCase()).toBe(base16);
      expect(encodeBytes(bytes, 'base32')).toBe(base32);
      const decoded16 = decodeToBytes(base16, 'base16');
      const decoded32 = decodeToBytes(base32, 'base32');
      expect(decoded16.ok && Array.from(decoded16.value)).toEqual(Array.from(bytes));
      expect(decoded32.ok && Array.from(decoded32.value)).toEqual(Array.from(bytes));
    }
  });
});

// RFC 4648 does not publish vectors for this tool's Binary, Base36, Base58,
// Base62, Base85/ASCII85, or basE91 modes. Base32-HEX is also unsupported.

describe('error handling', () => {
  it('rejects invalid characters per mode', () => {
    expect(decodeToBytes('zz', 'base16').ok).toBe(false);
    expect(decodeToBytes('!!!', 'base58').ok).toBe(false);
    expect(decodeToBytes("'''", 'base91').ok).toBe(false);
  });

  it('rejects empty input for every mode', () => {
    for (const { id } of BASE_N_MODES) {
      expect(decodeToBytes('', id).ok).toBe(false);
      expect(decodeToBytes('   ', id).ok).toBe(false);
    }
  });
});

describe('round-trip property (DUDE_PRD.md §21 Phase 23 Item 4)', () => {
  const modeArb = fc.constantFrom(...BASE_N_MODES.map((m) => m.id));

  it('decodeToBytes(encodeBytes(bytes, mode), mode) recovers the original bytes, for every mode', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 64 }), modeArb, (bytes, mode) => {
        const encoded = encodeBytes(bytes, mode);
        const decoded = decodeToBytes(encoded, mode);
        // Every mode's decoder rejects a blank string as "no input" rather than "zero bytes" --
        // a documented, deliberate UX choice (see decodeNonEmpty/decodeBaseX/decodeBase85/decodeBase91
        // above), not a round-trip bug, so the empty-bytes case is exempt from this property.
        if (bytes.length === 0) return;
        expect(decoded.ok).toBe(true);
        expect(decoded.ok && Array.from(decoded.value)).toEqual(Array.from(bytes));
      }),
    );
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  const modeArb = fc.constantFrom(...BASE_N_MODES.map((m) => m.id));

  it('decodeToBytes never throws for arbitrary text input, in any mode', () => {
    fc.assert(
      fc.property(fc.string(), modeArb, (text, mode) => {
        expect(() => decodeToBytes(text, mode)).not.toThrow();
      }),
    );
  });
});
