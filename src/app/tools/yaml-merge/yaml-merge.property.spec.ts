import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { mergeYaml } from './yaml-merge-transform';
import { load } from 'js-yaml';

describe('YAML merge properties', () => {
  it('preserves a generated scalar when overlay is empty mapping', () => {
    invariant((value) => mergeYaml(`value: ${JSON.stringify(value)}`, '{}'), fc.string({ maxLength: 24 }), (result, value) => {
      expect(result.ok).toBe(true);
      return result.ok && (load(result.output) as { value: string }).value === value;
    });
  });
});
