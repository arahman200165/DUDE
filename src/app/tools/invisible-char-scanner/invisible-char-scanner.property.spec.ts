import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { InvisibleCharKind, scanInvisibleChars, stripInvisibleChars } from './invisible-char-scan';

const ALL_KINDS: ReadonlySet<InvisibleCharKind> = new Set(['control', 'zero-width', 'invisible']);

describe('invisible-char-scanner fuzzing', () => {
  it('scanInvisibleChars/stripInvisibleChars never throw for arbitrary text', () => {
    neverThrows((text: string) => scanInvisibleChars(text), fc.string());
    neverThrows((text: string) => stripInvisibleChars(text, ALL_KINDS), fc.string());
  });

  it('stripping every kind leaves no invisible characters behind', () => {
    invariant(
      (text: string) => scanInvisibleChars(stripInvisibleChars(text, ALL_KINDS)),
      fc.string(),
      (occurrences) => occurrences.length === 0,
    );
  });

  it('stripping never produces more grapheme clusters than the input had', () => {
    invariant(
      (text: string) => ({ before: Array.from(text).length, after: Array.from(stripInvisibleChars(text, ALL_KINDS)).length }),
      fc.string(),
      ({ before, after }) => after <= before,
    );
  });
});
