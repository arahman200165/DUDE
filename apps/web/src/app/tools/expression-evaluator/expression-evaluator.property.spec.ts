import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { evaluateExpression } from "@dude/tool-engine/tools/expression-evaluator/expression-evaluate";

describe('expression evaluator properties', () => {
  it('returns a result object for arbitrary expression text', () => {
    neverThrows(
      (expression) => evaluateExpression(expression, {}),
      fc.string({ maxLength: 100 }),
      { assertShape: (result) => expect(result).toMatchObject({ ok: expect.any(Boolean) }) },
    );
  });
});
