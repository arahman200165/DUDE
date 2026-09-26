import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { parseEnv, serializeEnv } from './env-format';

const key = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,12}$/);
const value = fc.string({ maxLength: 30 });

describe('.env format properties', () => {
  it('round-trips valid key/value pairs through serialization', () => {
    invariant((pairs) => parseEnv(serializeEnv(pairs)), fc.uniqueArray(fc.record({ key, value }), { selector: (pair) => pair.key, maxLength: 12 }), (parsed, original) => {
      expect(parsed).toEqual(original);
      return parsed.length === original.length;
    });
  });
});

