import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { NormalizationForm, normalizeText } from './unicode-normalize';

const formArb = fc.constantFrom<NormalizationForm>('NFC', 'NFD', 'NFKC', 'NFKD');

describe('normalizeText fuzzing', () => {
  it('never throws for arbitrary text and any normalization form', () => {
    neverThrows(([text, form]: [string, NormalizationForm]) => normalizeText(text, form), fc.tuple(fc.string(), formArb), {
      assertShape: (result) => expect(typeof (result as { output: string }).output).toBe('string'),
    });
  });

  it('reports changed exactly when the output differs from the input', () => {
    invariant(
      ([text, form]: [string, NormalizationForm]) => normalizeText(text, form),
      fc.tuple(fc.string(), formArb),
      (result, [text]) => result.changed === (result.output !== text) && result.outputCodePointCount === Array.from(result.output).length,
    );
  });

  it('is idempotent: re-normalizing already-normalized text is a no-op', () => {
    invariant(
      ([text, form]: [string, NormalizationForm]) => {
        const once = normalizeText(text, form);
        const twice = normalizeText(once.output, form);
        return { once, twice };
      },
      fc.tuple(fc.string(), formArb),
      ({ once, twice }) => once.output === twice.output,
    );
  });
});
