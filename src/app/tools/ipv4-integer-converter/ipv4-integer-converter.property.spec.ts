import fc from 'fast-check';
import { describe, it } from 'vitest';
import { roundTrip } from '../../../testing/property-harness';
import { convertIpv4Integer } from './ipv4-integer-converter-logic';

describe('convertIpv4Integer properties', () => {
  it('round-trips every unsigned 32-bit IPv4 integer', () => {
    roundTrip(
      (value) => {
        const result = convertIpv4Integer(String(value), 'int-to-ip');
        if (!result.ok) throw new Error(result.error);
        return result.output;
      },
      (encoded) => {
        const result = convertIpv4Integer(encoded as string, 'ip-to-int');
        if (!result.ok) throw new Error(result.error);
        return Number(result.output);
      },
      fc.integer({ min: 0, max: 0xffffffff }),
    );
  });
});
