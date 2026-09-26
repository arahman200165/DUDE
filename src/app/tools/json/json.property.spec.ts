import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { processJson } from './json-format';

describe('JSON formatter properties', () => {
  it('pretty formatting parses back to the same JSON value', () => {
    invariant((value: unknown) => processJson(JSON.stringify(value), 'pretty', 2), fc.jsonValue(), (result, value) =>
      result.ok && JSON.parse(result.output) === value || result.ok && JSON.stringify(JSON.parse(result.output)) === JSON.stringify(value));
  });
  it('returns a typed result for arbitrary text', () => {
    neverThrows((input: string) => processJson(input, 'pretty', 2), fc.string(), {
      assertShape: (result) => expect(typeof result).toBe('object'),
    });
  });
});
