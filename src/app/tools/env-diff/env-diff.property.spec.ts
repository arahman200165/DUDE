import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { diffEnvFiles } from './env-diff-logic';

describe('.env diff properties', () => {
  it('returns a diff for arbitrary text pairs', () => {
    neverThrows(([before, after]) => diffEnvFiles(before, after), fc.tuple(fc.string(), fc.string()), {
      assertShape: (result) => expect(result).toBeTypeOf('object'),
    });
  });
});
