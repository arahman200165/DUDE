import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { rankSelectors, splitSelectorList } from "@dude/tool-engine/tools/css-specificity-calculator/css-specificity-logic";

describe('css-specificity-calculator properties', () => {
  it('splits selector lists without empty entries', () => invariant(splitSelectorList, fc.string({ maxLength: 300 }), (parts) => parts.every((part) => part.length > 0 && part === part.trim())));
  it('ranks arbitrary selector text without throwing and assigns ranks only to valid selectors', () => neverThrows((input: string) => rankSelectors(input), fc.string({ maxLength: 200 }), { assertShape: (value) => {
    if (!Array.isArray(value)) throw new Error('Expected ranked selectors');
    for (const item of value) {
      if (item.result.ok ? !Number.isInteger(item.rank) || (item.rank ?? 0) < 1 : item.rank !== undefined) throw new Error('Invalid selector rank');
    }
  } }));
});
