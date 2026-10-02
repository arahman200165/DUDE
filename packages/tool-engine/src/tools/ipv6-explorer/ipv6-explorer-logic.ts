/** Pure, framework-free IPv6 exploration — compressed/expanded forms, classification, and embedded-IPv4 detection, built on the shared `ip-math.ts` primitives. */
import { classifyIpv6, formatIpv6Compressed, formatIpv6Expanded, parseIpv6 } from "../ip-address-inspector/ip-math.js";

export interface Ipv6Exploration {
  readonly compressed: string;
  readonly expanded: string;
  readonly classification: string;
  readonly embeddedIpv4?: string;
}

/** IPv4-mapped (`::ffff:0:0/96`) and the deprecated IPv4-compatible (`::0.0.0.0/96`) forms both embed an IPv4 address in the low 32 bits. */
function embeddedIpv4For(value: bigint): string | undefined {
  const top96 = value >> 32n;
  if (top96 !== 0xffffn && top96 !== 0n) return undefined;
  if (top96 === 0n && value <= 1n) return undefined; // exclude :: and ::1 themselves

  const low32 = Number(value & 0xffffffffn);
  return [(low32 >>> 24) & 255, (low32 >>> 16) & 255, (low32 >>> 8) & 255, low32 & 255].join('.');
}

export function exploreIpv6(text: string): Ipv6Exploration | null {
  const value = parseIpv6(text);
  if (value === null) return null;

  return {
    compressed: formatIpv6Compressed(value),
    expanded: formatIpv6Expanded(value),
    classification: classifyIpv6(value),
    embeddedIpv4: embeddedIpv4For(value),
  };
}
