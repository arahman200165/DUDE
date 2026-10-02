import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { findReplace, FindReplaceOptions } from "@dude/tool-engine/tools/find-replace-text/find-replace-logic";

const optionsArb = fc.record({ caseSensitive: fc.boolean(), wholeWord: fc.boolean() });

describe('find-replace-text fuzzing', () => {
  it('never throws for arbitrary text/find/replace/options', () => {
    neverThrows(
      ([text, find, replace, options]: [string, string, string, FindReplaceOptions]) => findReplace(text, find, replace, options),
      fc.tuple(fc.string(), fc.string(), fc.string(), optionsArb),
    );
  });

  it('an empty search term is a no-op', () => {
    invariant(
      ([text, replace, options]: [string, string, FindReplaceOptions]) => findReplace(text, '', replace, options),
      fc.tuple(fc.string(), fc.string(), optionsArb),
      (result, [text]) => result.output === text && result.matchCount === 0,
    );
  });

  it('matchCount is zero exactly when the output is unchanged', () => {
    invariant(
      ([text, find, replace, options]: [string, string, string, FindReplaceOptions]) => ({ text, ...findReplace(text, find, replace, options) }),
      fc.tuple(fc.string(), fc.string(), fc.string(), optionsArb),
      ({ text, output, matchCount }) => (matchCount === 0 ? output === text : true),
    );
  });
});
