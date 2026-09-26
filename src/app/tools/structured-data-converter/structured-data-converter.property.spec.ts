import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { roundTrip } from '../../../testing/property-harness';
import { convertStructuredData } from './universal-convert';

describe('structured data conversion properties', () => {
  it('round-trips JSON-compatible values through YAML', () => {
    const arb = fc.jsonValue();
    roundTrip<unknown>(
      (value) => {
        const result = convertStructuredData(JSON.stringify(value), 'json', 'yaml');
        expect(result.ok).toBe(true);
        return (result as { ok: true; output: string }).output;
      },
      (yaml) => {
        const result = convertStructuredData(yaml as string, 'yaml', 'json');
        expect(result.ok).toBe(true);
        return JSON.parse((result as { ok: true; output: string }).output) as unknown;
      },
      arb,
    );
  });
});

