/** Pure, framework-free IP address inspection — auto-detects v4 vs v6 and reports the canonical form, classification, and expanded/binary/integer view. */
import { classifyIpv4, classifyIpv6, formatIpv4, formatIpv6Compressed, formatIpv6Expanded, ipv4ToInt, parseIpv4, parseIpv6 } from "./ip-math.js";

export interface IpInspection {
  readonly version: 4 | 6;
  readonly canonical: string;
  readonly classification: string;
  readonly expandedOrBinary: string;
  readonly integerOrHex: string;
}

export function inspectIpAddress(text: string): IpInspection | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const v4 = parseIpv4(trimmed);
  if (v4) {
    const value = ipv4ToInt(v4);
    return {
      version: 4,
      canonical: formatIpv4(v4),
      classification: classifyIpv4(v4),
      expandedOrBinary: v4.map((octet) => octet.toString(2).padStart(8, '0')).join('.'),
      integerOrHex: `${value} (0x${value.toString(16).padStart(8, '0')})`,
    };
  }

  const v6 = parseIpv6(trimmed);
  if (v6 !== null) {
    return {
      version: 6,
      canonical: formatIpv6Compressed(v6),
      classification: classifyIpv6(v6),
      expandedOrBinary: formatIpv6Expanded(v6),
      integerOrHex: `0x${v6.toString(16).padStart(32, '0')}`,
    };
  }

  return null;
}
