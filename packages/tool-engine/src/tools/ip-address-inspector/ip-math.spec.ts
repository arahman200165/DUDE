import {
  classifyIpv4,
  classifyIpv6,
  compressIpv6Groups,
  formatIpv6Compressed,
  formatIpv6Expanded,
  intToIpv4,
  ipv4ToInt,
  parseIpv4,
  parseIpv6,
} from "./ip-math.js";

describe('parseIpv4 / ipv4ToInt / intToIpv4', () => {
  it('parses and round-trips a valid address', () => {
    const octets = parseIpv4('192.168.1.1');
    expect(octets).toEqual([192, 168, 1, 1]);
    const value = ipv4ToInt(octets as [number, number, number, number]);
    expect(value).toBe(3232235777);
    expect(intToIpv4(value)).toEqual([192, 168, 1, 1]);
  });

  it('rejects an out-of-range octet', () => {
    expect(parseIpv4('256.0.0.1')).toBeNull();
  });

  it('rejects a malformed address', () => {
    expect(parseIpv4('not an ip')).toBeNull();
  });
});

describe('classifyIpv4', () => {
  it('classifies loopback', () => {
    expect(classifyIpv4(parseIpv4('127.0.0.1') as [number, number, number, number])).toBe('Loopback');
  });

  it('classifies RFC 1918 private ranges', () => {
    expect(classifyIpv4(parseIpv4('10.0.0.1') as [number, number, number, number])).toBe('Private (RFC 1918)');
    expect(classifyIpv4(parseIpv4('172.16.0.1') as [number, number, number, number])).toBe('Private (RFC 1918)');
    expect(classifyIpv4(parseIpv4('192.168.1.1') as [number, number, number, number])).toBe('Private (RFC 1918)');
  });

  it('classifies a public address', () => {
    expect(classifyIpv4(parseIpv4('8.8.8.8') as [number, number, number, number])).toBe('Public / global unicast');
  });

  it('classifies broadcast', () => {
    expect(classifyIpv4(parseIpv4('255.255.255.255') as [number, number, number, number])).toBe('Broadcast');
  });
});

describe('parseIpv6', () => {
  it('parses the unspecified address', () => {
    expect(parseIpv6('::')).toBe(0n);
  });

  it('parses the loopback address', () => {
    expect(parseIpv6('::1')).toBe(1n);
  });

  it('parses a fully expanded address', () => {
    expect(parseIpv6('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(parseIpv6('2001:db8::1'));
  });

  it('parses an IPv4-mapped address', () => {
    const value = parseIpv6('::ffff:192.168.1.1');
    expect(value).not.toBeNull();
    expect(formatIpv6Expanded(value as bigint)).toBe('0000:0000:0000:0000:0000:ffff:c0a8:0101');
  });

  it('rejects more than one "::"', () => {
    expect(parseIpv6('::1::2')).toBeNull();
  });

  it('rejects too many groups', () => {
    expect(parseIpv6('1:2:3:4:5:6:7:8:9')).toBeNull();
  });

  it('rejects an invalid hex group', () => {
    expect(parseIpv6('gggg::1')).toBeNull();
  });
});

describe('classifyIpv6', () => {
  it('classifies loopback and unspecified', () => {
    expect(classifyIpv6(1n)).toBe('Loopback');
    expect(classifyIpv6(0n)).toBe('Unspecified');
  });

  it('classifies link-local', () => {
    expect(classifyIpv6(parseIpv6('fe80::1') as bigint)).toBe('Link-local');
  });

  it('classifies unique-local', () => {
    expect(classifyIpv6(parseIpv6('fc00::1') as bigint)).toBe('Unique local (RFC 4193)');
  });

  it('classifies multicast', () => {
    expect(classifyIpv6(parseIpv6('ff02::1') as bigint)).toBe('Multicast');
  });

  it('classifies the documentation range', () => {
    expect(classifyIpv6(parseIpv6('2001:db8::1') as bigint)).toBe('Documentation (RFC 3849)');
  });

  it('classifies global unicast', () => {
    expect(classifyIpv6(parseIpv6('2606:4700:4700::1111') as bigint)).toBe('Global unicast');
  });
});

describe('compressIpv6Groups / formatIpv6Compressed', () => {
  it('compresses the longest run of zero groups', () => {
    expect(compressIpv6Groups(['2001', 'db8', '0', '0', '0', '0', '0', '1'])).toBe('2001:db8::1');
  });

  it('does not compress a single zero group', () => {
    expect(compressIpv6Groups(['1', '0', '2', '3', '4', '5', '6', '7'])).toBe('1:0:2:3:4:5:6:7');
  });

  it('round-trips a compressed address through parseIpv6', () => {
    const value = parseIpv6('2001:db8::1') as bigint;
    expect(formatIpv6Compressed(value)).toBe('2001:db8::1');
  });
});
