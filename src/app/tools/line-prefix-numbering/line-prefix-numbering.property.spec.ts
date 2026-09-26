import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { addLineNumbers, addPrefixSuffix, applyPerLineTransform, removeLineNumbers } from './line-prefix-numbering-logic';

// removeLineNumbers strips a leading "<digits><one of .):><whitespace>*" prefix, and that trailing
// `\s*` is greedy. That is only an exact inverse of addLineNumbers when the separator is drawn
// from that recognized set, and the original line starts with neither a digit (ambiguous once
// concatenated with the numeric prefix) nor whitespace (which the greedy `\s*` would swallow
// along with the separator's own trailing space).
const roundTrippableLineArb = fc.string().filter((s) => !s.includes('\n') && !/^[\d\s]/.test(s));
interface LineNumberCase {
  readonly lines: readonly string[];
  readonly start: number;
  readonly padded: boolean;
  readonly separator: string;
}

const caseArb: fc.Arbitrary<LineNumberCase> = fc.record({
  lines: fc.array(roundTrippableLineArb, { maxLength: 15 }),
  start: fc.integer({ min: 0, max: 1000 }),
  padded: fc.boolean(),
  separator: fc.constantFrom('. ', ': ', ') ', ' '),
});

describe('addLineNumbers / removeLineNumbers round-trip property', () => {
  it('removeLineNumbers(addLineNumbers(text)) recovers the original lines', () => {
    invariant(
      ({ lines, start, padded, separator }: LineNumberCase) => {
        const numbered = addLineNumbers(lines.join('\n'), { start, padded, separator });
        return removeLineNumbers(numbered).split('\n');
      },
      caseArb,
      (recovered, { lines }) => recovered.join('\n') === lines.join('\n'),
    );
  });
});

describe('line-prefix-numbering fuzzing', () => {
  it('addPrefixSuffix/applyPerLineTransform never throw for arbitrary text', () => {
    neverThrows(([text, prefix, suffix]: [string, string, string]) => addPrefixSuffix(text, prefix, suffix), fc.tuple(fc.string(), fc.string(), fc.string()));
    neverThrows(
      ([text, transform]: [string, 'uppercase' | 'lowercase' | 'trim' | 'wrap-quotes']) => applyPerLineTransform(text, transform),
      fc.tuple(fc.string(), fc.constantFrom('uppercase', 'lowercase', 'trim', 'wrap-quotes')),
    );
  });

  it('addPrefixSuffix always preserves the input line count', () => {
    invariant(
      ([text, prefix, suffix]: [string, string, string]) => ({ text, output: addPrefixSuffix(text, prefix, suffix) }),
      fc.tuple(fc.string(), fc.string(), fc.string()),
      ({ text, output }) => output.split('\n').length === text.split('\n').length,
    );
  });
});
