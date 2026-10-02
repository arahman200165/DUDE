import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from "../../../../../../tests/property-harness";
import { generateNanoIds } from "@dude/tool-engine/tools/nanoid-generator/nanoid-logic";

describe('NanoID generator properties', () => {
  it('respects count, size, and custom alphabet', () => {
    invariant(
      ({ count, size, alphabet }) => generateNanoIds(count, size, alphabet),
      fc.record({ count: fc.integer({ min: 1, max: 20 }), size: fc.integer({ min: 1, max: 64 }), alphabet: fc.constantFrom('ab', '0123', 'xyz') }),
      (result, options) => result.ok && result.values.length === options.count && result.values.every((value) => value.length === options.size && [...value].every((char) => options.alphabet.includes(char))),
    );
  });
});
