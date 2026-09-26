import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { evaluateQuery } from './json-query-eval';

describe('JSON query properties', () => {
  it('never throws on arbitrary query text in either language', () => {
    neverThrows(([json, query, language]: [string, string, 'jsonpath' | 'jmespath']) => evaluateQuery(json, query, language),
      fc.tuple(fc.string(), fc.string(), fc.constantFrom('jsonpath' as const, 'jmespath' as const)), {
        assertShape: (result) => expect(typeof result).toBe('object'),
      });
  });
});
