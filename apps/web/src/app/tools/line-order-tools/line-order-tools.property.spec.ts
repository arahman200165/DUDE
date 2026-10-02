import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { reverseLines, shuffleLines, sortLines, SortVariant } from "@dude/tool-engine/tools/line-order-tools/line-order-logic";

const lineArb = fc.string().filter((s) => !s.includes('\n'));
const textArb = fc.array(lineArb, { maxLength: 20 }).map((lines) => lines.join('\n'));
const variantArb = fc.constantFrom<SortVariant>('asc', 'desc', 'natural', 'by-length');

function multiset(lines: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

function sameMultiset(a: readonly string[], b: readonly string[]): boolean {
  const countsA = multiset(a);
  const countsB = multiset(b);
  if (countsA.size !== countsB.size) return false;
  return [...countsA].every(([line, count]) => countsB.get(line) === count);
}

describe('line-order-tools fuzzing', () => {
  it('never throws for arbitrary text', () => {
    neverThrows(([text, variant]: [string, SortVariant]) => sortLines(text, variant), fc.tuple(textArb, variantArb));
    neverThrows((text: string) => reverseLines(text), textArb);
    neverThrows((text: string) => shuffleLines(text), textArb);
  });

  it('reverseLines is an involution', () => {
    invariant(
      (text: string) => reverseLines(reverseLines(text)),
      textArb,
      (result, text) => result === text,
    );
  });

  it('sortLines/shuffleLines only reorder lines, never add/remove/change any', () => {
    invariant(
      ([text, variant]: [string, SortVariant]) => ({ text, sorted: sortLines(text, variant) }),
      fc.tuple(textArb, variantArb),
      ({ text, sorted }) => sameMultiset(text.split('\n'), sorted.split('\n')),
    );

    invariant(
      (text: string) => ({ text, shuffled: shuffleLines(text) }),
      textArb,
      ({ text, shuffled }) => sameMultiset(text.split('\n'), shuffled.split('\n')),
    );
  });
});
