import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { roundTrip } from '../../../testing/property-harness';
import { convertYaml } from './yaml-convert';

describe('YAML/JSON conversion properties', () => {
  it('round-trips JSON-compatible values through YAML', () => {
    roundTrip<unknown>(
      (value) => {
        const result = convertYaml(JSON.stringify(value), 'json-to-yaml', 2);
        expect(result.ok).toBe(true);
        return (result as { ok: true; output: string }).output;
      },
      (yaml) => {
        const result = convertYaml(yaml as string, 'yaml-to-json', 2);
        expect(result.ok).toBe(true);
        return JSON.parse((result as { ok: true; output: string }).output) as unknown;
      },
      fc.jsonValue(),
    );
  });
});

