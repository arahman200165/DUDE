import { calculateCidr } from './cidr-calculator-logic';

describe('calculateCidr', () => {
  it('calculates the RFC 4632 section 3.1 172.16.0.0/16 prefix and mask example', () => {
    expect(calculateCidr('172.16.0.0/16')).toEqual({
      network: '172.16.0.0', broadcast: '172.16.255.255', netmask: '255.255.0.0', prefixLength: 16,
      firstUsable: '172.16.0.1', lastUsable: '172.16.255.254', totalAddresses: 65536, usableHosts: 65534,
    });
  });
  it('calculates a typical /24 network', () => {
    expect(calculateCidr('192.168.1.10/24')).toEqual({
      network: '192.168.1.0',
      broadcast: '192.168.1.255',
      netmask: '255.255.255.0',
      prefixLength: 24,
      firstUsable: '192.168.1.1',
      lastUsable: '192.168.1.254',
      totalAddresses: 256,
      usableHosts: 254,
    });
  });

  it('calculates a /30 network', () => {
    const result = calculateCidr('10.0.0.5/30');
    expect(result).toEqual({
      network: '10.0.0.4',
      broadcast: '10.0.0.7',
      netmask: '255.255.255.252',
      prefixLength: 30,
      firstUsable: '10.0.0.5',
      lastUsable: '10.0.0.6',
      totalAddresses: 4,
      usableHosts: 2,
    });
  });

  it('treats a /31 as a point-to-point link with both addresses usable', () => {
    const result = calculateCidr('10.0.0.0/31');
    expect(result?.usableHosts).toBe(2);
    expect(result?.firstUsable).toBe('10.0.0.0');
    expect(result?.lastUsable).toBe('10.0.0.1');
  });

  it('treats a /32 as a single host', () => {
    const result = calculateCidr('10.0.0.1/32');
    expect(result).toMatchObject({ network: '10.0.0.1', broadcast: '10.0.0.1', usableHosts: 1, totalAddresses: 1 });
  });

  it('returns null for a missing prefix', () => {
    expect(calculateCidr('192.168.1.1')).toBeNull();
  });

  it('returns null for an out-of-range prefix', () => {
    expect(calculateCidr('192.168.1.1/33')).toBeNull();
  });

  it('returns null for a malformed IP', () => {
    expect(calculateCidr('not an ip/24')).toBeNull();
  });
});
