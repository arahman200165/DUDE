import { describe, expect, it } from 'vitest';
import { CIDR_ERROR, cidrRows, wildcardMask } from './cidr-calculator-mobile';

const value = (input: string, key: string): string | undefined => {
  const result = cidrRows(input);
  return result.ok && typeof result.output !== 'string' ? result.output.find(row => row.key === key)?.value : undefined;
};

describe('wildcardMask', () => {
  it('inverts the netmask', () => {
    expect(wildcardMask('255.255.255.0')).toBe('0.0.0.255');
    expect(wildcardMask('255.255.255.252')).toBe('0.0.0.3');
    expect(wildcardMask('255.255.255.255')).toBe('0.0.0.0');
  });
});

describe('cidrRows', () => {
  it('lists the /24 vector from cidr-calculator-logic.spec.ts', () => {
    expect(['network', 'broadcast', 'first', 'last', 'hosts', 'total', 'netmask', 'wildcard'].map(key => value('192.168.1.10/24', key)))
      .toEqual(['192.168.1.0', '192.168.1.255', '192.168.1.1', '192.168.1.254', '254', '256', '255.255.255.0', '0.0.0.255']);
  });
  it('rejects a missing prefix', () => {
    expect(cidrRows('192.168.1.1')).toEqual({ ok: false, error: CIDR_ERROR });
  });
});
