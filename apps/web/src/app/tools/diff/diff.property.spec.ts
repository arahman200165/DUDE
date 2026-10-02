import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { computeLineDiff } from "@dude/tool-engine/tools/diff/text-diff";

const lineArb = fc.string().filter((s) => !s.includes('\n'));
const textArb = fc.array(lineArb, { maxLength: 20 }).map((lines) => lines.join('\n'));

describe('computeLineDiff fuzzing', () => {
  it('never throws for arbitrary left/right text', () => {
    neverThrows(([left, right]: [string, string]) => computeLineDiff(left, right), fc.tuple(textArb, textArb));
  });

  it('summary counts always add up to the number of diff lines', () => {
    invariant(
      ([left, right]: [string, string]) => computeLineDiff(left, right),
      fc.tuple(textArb, textArb),
      (result) => result.summary.added + result.summary.removed + result.summary.unchanged === result.lines.length,
    );
  });

  it('diffing text against itself reports every line as equal', () => {
    invariant(
      (text: string) => computeLineDiff(text, text),
      textArb,
      (result) => result.summary.added === 0 && result.summary.removed === 0 && result.lines.every((line) => line.type === 'equal'),
    );
  });
});
