import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from '../../../testing/property-harness';
import { convertPunycode } from './punycode-convert';

// A curated, mixed-script character set (ASCII letters/digits plus accented Latin, CJK, Cyrillic,
// and Greek) that punycode's toASCII/toUnicode always round-trips cleanly — avoids characters
// that trip label-specific edge cases (an already-"xn--"-prefixed label decodes as existing
// Punycode and throws "Invalid input", which is exercised separately by the neverThrows fuzz below).
const SAFE_CHARS = ['a', 'b', 'c', 'x', 'y', 'z', '0', '9', 'é', 'ü', 'ñ', '日', '本', '語', 'я', 'и', 'Ω', 'β'] as const;
const labelArb = fc.array(fc.constantFrom(...SAFE_CHARS), { minLength: 1, maxLength: 8 }).map((chars) => chars.join(''));
const domainArb = fc.array(labelArb, { minLength: 1, maxLength: 3 }).map((labels) => labels.join('.'));

describe('convertPunycode round-trip', () => {
  it('recovers the original Unicode domain after toASCII then toUnicode', () => {
    roundTrip(
      (domain: string) => {
        const result = convertPunycode(domain, 'toASCII');
        if (!result.ok) throw new Error(`unexpected toASCII failure for ${JSON.stringify(domain)}: ${result.error}`);
        return result.value;
      },
      (ascii) => {
        const result = convertPunycode(ascii as string, 'toUnicode');
        if (!result.ok) throw new Error(`unexpected toUnicode failure: ${result.error}`);
        return result.value;
      },
      domainArb,
    );
  });
});

describe('convertPunycode fuzzing', () => {
  it('never throws for arbitrary text in either direction', () => {
    const directionArb = fc.constantFrom('toASCII' as const, 'toUnicode' as const);
    neverThrows(
      (input: { text: string; direction: 'toASCII' | 'toUnicode' }) => convertPunycode(input.text, input.direction),
      fc.record({ text: fc.string(), direction: directionArb }),
      {
        assertShape: (result) => {
          const r = result as { ok: boolean };
          if (typeof r.ok !== 'boolean') throw new Error('expected a PunycodeResult');
        },
      },
    );
  });
});
