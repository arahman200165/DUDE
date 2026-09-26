import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { exploreIpv6 } from './ipv6-explorer-logic';
import { formatIpv6Compressed, parseIpv6 } from '../ip-address-inspector/ip-math';

describe('exploreIpv6 properties', () => {
  it('preserves the address through compressed and expanded forms', () => {
    invariant(exploreIpv6, fc.bigInt({ min: 0n, max: (1n << 128n) - 1n }).map(formatIpv6Compressed), (result, input) =>
      result !== null && parseIpv6(result.compressed) === parseIpv6(input) && parseIpv6(result.expanded) === parseIpv6(input));
  });
});
