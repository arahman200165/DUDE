import { exploreIpv6 } from './ipv6-explorer-logic';

describe('exploreIpv6', () => {
  it('matches RFC 5952 leading-zero, longest-run, and equal-run canonical forms', () => {
    expect(exploreIpv6('2001:db8:0:0:1:0:0:1')?.compressed).toBe('2001:db8::1:0:0:1');
    expect(exploreIpv6('2001:0:0:1:0:0:0:1')?.compressed).toBe('2001:0:0:1::1');
    expect(exploreIpv6('2001:0db8::0001')?.compressed).toBe('2001:db8::1');
  });
  it('reports the compressed and expanded forms', () => {
    const result = exploreIpv6('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(result?.compressed).toBe('2001:db8::1');
    expect(result?.expanded).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(result?.classification).toBe('Documentation (RFC 3849)');
  });

  it('detects an IPv4-mapped address', () => {
    const result = exploreIpv6('::ffff:192.168.1.1');
    expect(result?.embeddedIpv4).toBe('192.168.1.1');
  });

  it('does not report an embedded IPv4 for a normal global unicast address', () => {
    const result = exploreIpv6('2606:4700:4700::1111');
    expect(result?.embeddedIpv4).toBeUndefined();
  });

  it('does not misdetect the loopback address as embedding 0.0.0.1', () => {
    const result = exploreIpv6('::1');
    expect(result?.embeddedIpv4).toBeUndefined();
  });

  it('returns null for malformed input', () => {
    expect(exploreIpv6('not an ipv6 address')).toBeNull();
  });
});
