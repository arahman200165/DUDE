/** Pure, framework-free IPv4 CIDR arithmetic, built on the shared `ip-math.ts` primitives. */
import { formatIpv4, intToIpv4, ipv4Mask, ipv4ToInt, parseIpv4 } from "../ip-address-inspector/ip-math.js";

export interface CidrInfo {
  readonly network: string;
  readonly broadcast: string;
  readonly netmask: string;
  readonly prefixLength: number;
  readonly firstUsable: string;
  readonly lastUsable: string;
  readonly totalAddresses: number;
  readonly usableHosts: number;
}

const CIDR_RE = /^(.+)\/(\d{1,2})$/;

export function calculateCidr(text: string): CidrInfo | null {
  const match = CIDR_RE.exec(text.trim());
  if (!match) return null;

  const prefixLength = Number(match[2]);
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) return null;

  const octets = parseIpv4(match[1].trim());
  if (!octets) return null;

  const mask = ipv4Mask(prefixLength);
  const networkValue = ipv4ToInt(octets) & mask;
  const broadcastValue = (networkValue | (~mask >>> 0)) >>> 0;
  const totalAddresses = 2 ** (32 - prefixLength);

  // /31 and /32 have no distinct network/broadcast/usable split (RFC 3021 point-to-point, or a single host).
  const noSplit = prefixLength >= 31;

  return {
    network: formatIpv4(intToIpv4(networkValue)),
    broadcast: formatIpv4(intToIpv4(broadcastValue)),
    netmask: formatIpv4(intToIpv4(mask)),
    prefixLength,
    firstUsable: formatIpv4(intToIpv4(noSplit ? networkValue : networkValue + 1)),
    lastUsable: formatIpv4(intToIpv4(noSplit ? broadcastValue : broadcastValue - 1)),
    totalAddresses,
    usableHosts: noSplit ? totalAddresses : totalAddresses - 2,
  };
}
