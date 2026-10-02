import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { findMatches } from "@dude/tool-engine/tools/regex/regex-match";

const literalPattern = fc.array(fc.constantFrom('a', 'b', '0', '1'), { minLength: 1, maxLength: 8 }).map((chars) => chars.join(''));

describe('findMatches properties', () => {
  it('never throws for safe literals with arbitrary flags and bounded text', () => {
    neverThrows(([pattern, flags, text]) => findMatches(pattern, flags, text), fc.tuple(literalPattern, fc.string(), fc.string({ maxLength: 64 })), {
      assertShape: (result) => expect(typeof result === 'object' && result !== null).toBe(true),
    });
  });

  it('reports the same global literal matches as the native RegExp implementation', () => {
    invariant(([source, text]) => findMatches(source, '', text), fc.tuple(literalPattern, fc.string({ maxLength: 64 })), (result, [source, text]) => {
      if (!result.ok) return false;
      const expected = [...text.matchAll(new RegExp(source, 'g'))].map((match) => ({ match: match[0], index: match.index }));
      return result.matches.length === expected.length && result.matches.every((match, index) => match.match === expected[index].match && match.index === expected[index].index);
    });
  });
});

