import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { findDuplicateLines, removeDuplicateLines } from "@dude/tool-engine/tools/duplicate-finder/duplicate-finder-logic";

const lineArb = fc.string().filter((s) => !s.includes('\n'));
const textArb = fc.array(lineArb, { maxLength: 20 }).map((lines) => lines.join('\n'));

describe('duplicate-finder fuzzing', () => {
  it('findDuplicateLines/removeDuplicateLines never throw for arbitrary text', () => {
    neverThrows(([text, caseSensitive]: [string, boolean]) => findDuplicateLines(text, caseSensitive), fc.tuple(textArb, fc.boolean()));
    neverThrows(([text, caseSensitive]: [string, boolean]) => removeDuplicateLines(text, caseSensitive), fc.tuple(textArb, fc.boolean()));
  });

  it('removeDuplicateLines never grows the line count and is idempotent', () => {
    invariant(
      ([text, caseSensitive]: [string, boolean]) => {
        const once = removeDuplicateLines(text, caseSensitive);
        const twice = removeDuplicateLines(once, caseSensitive);
        return { originalLineCount: text.split('\n').length, once, twice };
      },
      fc.tuple(textArb, fc.boolean()),
      ({ originalLineCount, once, twice }) => once.split('\n').length <= originalLineCount && twice === once,
    );
  });

  it('removeDuplicateLines leaves no duplicates behind (per the same case-sensitivity option)', () => {
    invariant(
      ([text, caseSensitive]: [string, boolean]) => findDuplicateLines(removeDuplicateLines(text, caseSensitive), caseSensitive),
      fc.tuple(textArb, fc.boolean()),
      (duplicates) => duplicates.length === 0,
    );
  });
});
