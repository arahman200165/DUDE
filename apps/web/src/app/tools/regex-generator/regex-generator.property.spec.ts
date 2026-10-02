import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from "../../../../../../tests/property-harness";
import { generateHeuristicRegex } from "@dude/tool-engine/tools/regex-generator/regex-generate";

const examples = fc.array(fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/), { minLength: 1, maxLength: 8 });

describe('generateHeuristicRegex properties', () => {
  it('deterministically generates a valid pattern matching every supplied example', () => {
    invariant(generateHeuristicRegex, examples, (result, input) => {
      if (!result.ok) return false;
      const repeat = generateHeuristicRegex(input);
      const regex = new RegExp(result.pattern);
      return repeat.ok && repeat.pattern === result.pattern && input.every((example) => regex.test(example));
    });
  });
});
