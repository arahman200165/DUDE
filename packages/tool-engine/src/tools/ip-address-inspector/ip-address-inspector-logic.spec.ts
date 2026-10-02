import { inspectIpAddress } from "./ip-address-inspector-logic.js";

describe('inspectIpAddress', () => {
  it('inspects an IPv4 address', () => {
    const result = inspectIpAddress('192.168.1.1');
    expect(result).toEqual({
      version: 4,
      canonical: '192.168.1.1',
      classification: 'Private (RFC 1918)',
      expandedOrBinary: '11000000.10101000.00000001.00000001',
      integerOrHex: '3232235777 (0xc0a80101)',
    });
  });

  it('inspects an IPv6 address', () => {
    const result = inspectIpAddress('2001:db8::1');
    expect(result?.version).toBe(6);
    expect(result?.classification).toBe('Documentation (RFC 3849)');
    expect(result?.expandedOrBinary).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
  });

  it('returns null for malformed input', () => {
    expect(inspectIpAddress('not an ip')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(inspectIpAddress('')).toBeNull();
  });
});
