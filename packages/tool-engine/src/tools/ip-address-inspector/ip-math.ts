/**
 * Pure, framework-free IP address arithmetic — IPv4 as a 32-bit unsigned
 * integer, IPv6 as a 128-bit `bigint` (exceeds `number`'s safe integer
 * range). Shared by every IP/networking tool in this batch rather than each
 * re-deriving parse/format/classify logic.
 */

export type Ipv4Octets = readonly [number, number, number, number];

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseIpv4(text: string): Ipv4Octets | null {
  const match = IPV4_RE.exec(text.trim());
  if (!match) return null;

  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  if (octets.some((octet) => octet < 0 || octet > 255)) return null;

  return octets as unknown as Ipv4Octets;
}

export function ipv4ToInt(octets: Ipv4Octets): number {
  return (((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0);
}

export function intToIpv4(value: number): Ipv4Octets {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

export function formatIpv4(octets: Ipv4Octets): string {
  return octets.join('.');
}

export function ipv4Mask(prefixLength: number): number {
  return prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
}

export function ipv4InCidr(octets: Ipv4Octets, base: Ipv4Octets, prefixLength: number): boolean {
  const mask = ipv4Mask(prefixLength);
  return (ipv4ToInt(octets) & mask) === (ipv4ToInt(base) & mask);
}

const IPV4_SPECIAL_RANGES: readonly { readonly base: Ipv4Octets; readonly prefix: number; readonly label: string }[] = [
  { base: [127, 0, 0, 0], prefix: 8, label: 'Loopback' },
  { base: [10, 0, 0, 0], prefix: 8, label: 'Private (RFC 1918)' },
  { base: [172, 16, 0, 0], prefix: 12, label: 'Private (RFC 1918)' },
  { base: [192, 168, 0, 0], prefix: 16, label: 'Private (RFC 1918)' },
  { base: [169, 254, 0, 0], prefix: 16, label: 'Link-local' },
  { base: [100, 64, 0, 0], prefix: 10, label: 'Shared address space / CGNAT (RFC 6598)' },
  { base: [224, 0, 0, 0], prefix: 4, label: 'Multicast' },
  { base: [240, 0, 0, 0], prefix: 4, label: 'Reserved' },
];

export function classifyIpv4(octets: Ipv4Octets): string {
  if (octets.join('.') === '255.255.255.255') return 'Broadcast';
  for (const range of IPV4_SPECIAL_RANGES) {
    if (ipv4InCidr(octets, range.base, range.prefix)) return range.label;
  }
  return 'Public / global unicast';
}

/** Expands an IPv4-mapped/compatible tail (e.g. `::ffff:192.168.1.1`) into two hex groups before general IPv6 parsing. */
function expandEmbeddedIpv4(text: string): string | null {
  const match = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
  if (!match) return text;

  const octets = parseIpv4(match[1]);
  if (!octets) return null;

  const high = ((octets[0] << 8) | octets[1]).toString(16);
  const low = ((octets[2] << 8) | octets[3]).toString(16);
  return `${text.slice(0, text.length - match[1].length)}${high}:${low}`;
}

export function parseIpv6(text: string): bigint | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const expanded = expandEmbeddedIpv4(trimmed);
  if (expanded === null) return null;

  if ((expanded.match(/::/g) ?? []).length > 1) return null;

  const hasCompression = expanded.includes('::');
  const [head, tail] = hasCompression ? expanded.split('::') : [expanded, undefined];
  const headParts = head === '' ? [] : head.split(':');
  const tailParts = tail === undefined || tail === '' ? [] : tail.split(':');

  let groups: readonly string[];
  if (hasCompression) {
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return null;
    groups = [...headParts, ...Array(missing).fill('0'), ...tailParts];
  } else {
    groups = headParts;
  }

  if (groups.length !== 8 || !groups.every((group) => /^[0-9a-fA-F]{1,4}$/.test(group))) return null;

  let value = 0n;
  for (const group of groups) value = (value << 16n) | BigInt(parseInt(group, 16));
  return value;
}

export function ipv6ToGroups(value: bigint): readonly string[] {
  const groups: string[] = [];
  for (let i = 0; i < 8; i++) {
    const shift = BigInt((7 - i) * 16);
    groups.push(Number((value >> shift) & 0xffffn).toString(16));
  }
  return groups;
}

/** Replaces the longest run of two-or-more all-zero groups with `::`, per RFC 5952. */
export function compressIpv6Groups(groups: readonly string[]): string {
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === '0') {
      if (curStart === -1) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  if (bestLen < 2) return groups.join(':');
  const before = groups.slice(0, bestStart).join(':');
  const after = groups.slice(bestStart + bestLen).join(':');
  return `${before}::${after}`;
}

export function formatIpv6Compressed(value: bigint): string {
  return compressIpv6Groups(ipv6ToGroups(value));
}

export function formatIpv6Expanded(value: bigint): string {
  return ipv6ToGroups(value)
    .map((group) => group.padStart(4, '0'))
    .join(':');
}

function topBits(value: bigint, bits: number): bigint {
  return value >> BigInt(128 - bits);
}

export function classifyIpv6(value: bigint): string {
  if (value === 0n) return 'Unspecified';
  if (value === 1n) return 'Loopback';
  if (topBits(value, 10) === 0b1111111010n) return 'Link-local';
  if (topBits(value, 7) === 0b1111110n) return 'Unique local (RFC 4193)';
  if (topBits(value, 8) === 0xffn) return 'Multicast';
  if (topBits(value, 32) === 0x20010db8n) return 'Documentation (RFC 3849)';
  return 'Global unicast';
}
