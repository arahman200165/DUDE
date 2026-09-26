import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { convertEnvJson } from './env-json-converter-logic';
import { parseEnv, serializeEnv } from '../env-editor/env-format';

const pairsArb = fc.uniqueArray(
  fc.record({ key: fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,12}$/), value: fc.string({ maxLength: 30 }) }),
  { selector: (pair) => pair.key, minLength: 1, maxLength: 12 },
);

describe('.env JSON conversion properties', () => {
  it('round-trips valid .env pairs through JSON', () => {
    invariant((pairs) => {
      const json = convertEnvJson(serializeEnv(pairs), 'env-to-json');
      if (!json.ok) return null;
      const env = convertEnvJson(json.output, 'json-to-env');
      return env.ok ? parseEnv(env.output) : null;
    }, pairsArb, (result, original) => {
      expect(result).toEqual(original);
      return result !== null;
    });
  });

  it('never throws for arbitrary text in either conversion direction', () => {
    neverThrows(([input, direction]) => convertEnvJson(input, direction), fc.tuple(fc.string(), fc.constantFrom('env-to-json' as const, 'json-to-env' as const)), {
      assertShape: (result) => expect(result).toHaveProperty('ok'),
    });
  });
});

