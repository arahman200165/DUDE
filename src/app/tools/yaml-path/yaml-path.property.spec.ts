import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { evaluateYamlPath } from './yaml-path-eval';

describe('YAML path properties', () => {
  it('evaluates the root query without throwing for generated scalar YAML', () => {
    neverThrows((value) => evaluateYamlPath(`value: ${JSON.stringify(value)}`, '$', 'jsonpath'), fc.string({ maxLength: 20 }), {
      assertShape: (result) => expect(typeof result).toBe('object'),
    });
  });
});
