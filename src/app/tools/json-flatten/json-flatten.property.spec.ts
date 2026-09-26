import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { flattenJson } from './json-flatten-transform';

describe('JSON flatten properties', () => {
  it('never throws for arbitrary JSON text in either direction', () => {
    neverThrows((input: string) => [flattenJson(input, 'flatten'), flattenJson(input, 'unflatten')], fc.string(), {
      assertShape: (result) => expect(Array.isArray(result)).toBe(true),
    });
  });
});
