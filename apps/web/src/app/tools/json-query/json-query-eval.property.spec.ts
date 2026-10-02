import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { evaluateQuery } from "@dude/tool-engine/tools/json-query/json-query-eval";

describe('JSON query properties', () => {
  it('never throws on arbitrary query text in either language', () => {
    neverThrows(([json, query, language]: [string, string, 'jsonpath' | 'jmespath']) => evaluateQuery(json, query, language),
      fc.tuple(fc.string(), fc.string(), fc.constantFrom('jsonpath' as const, 'jmespath' as const)), {
        assertShape: (result) => expect(typeof result).toBe('object'),
      });
  });
});
