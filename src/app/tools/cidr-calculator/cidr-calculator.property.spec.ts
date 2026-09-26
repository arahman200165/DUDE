import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { calculateCidr } from './cidr-calculator-logic';

const ipv4 = fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255), fc.nat(255)).map((parts) => parts.join('.'));

describe('calculateCidr properties', () => {
  it('never throws and returns either a result or null for arbitrary text', () => {
    neverThrows((input) => calculateCidr(input), fc.string());
  });

  it('returns aligned networks with the corresponding address count for valid prefixes', () => {
    invariant((input) => calculateCidr(input), fc.tuple(ipv4, fc.integer({ min: 0, max: 32 })).map(([ip, prefix]) => `${ip}/${prefix}`), (result) => {
      if (!result) return false;
      const network = result.network.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
      return network % result.totalAddresses === 0 && result.totalAddresses === 2 ** (32 - result.prefixLength);
    });
  });
});
