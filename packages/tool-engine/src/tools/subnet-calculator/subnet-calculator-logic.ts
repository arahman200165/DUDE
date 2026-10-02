/**
 * Pure, framework-free IPv4 subnet splitting: divides a base CIDR block into
 * N equal subnets, or into subnets of a given prefix length, reusing the CIDR
 * Calculator's `calculateCidr` for each resulting subnet's full detail.
 */
import { formatIpv4, intToIpv4, ipv4Mask, ipv4ToInt, parseIpv4 } from "../ip-address-inspector/ip-math.js";
import { calculateCidr, type CidrInfo } from "../cidr-calculator/cidr-calculator-logic.js";

export type SubnetSplitMode = 'count' | 'newPrefix';

const CIDR_RE = /^(.+)\/(\d{1,2})$/;
const MAX_SUBNETS = 4096;

export type SplitSubnetResult = { readonly ok: true; readonly subnets: readonly CidrInfo[] } | { readonly ok: false; readonly error: string };

export function splitSubnet(baseText: string, mode: SubnetSplitMode, param: number): SplitSubnetResult {
  const match = CIDR_RE.exec(baseText.trim());
  if (!match) return { ok: false, error: 'Enter a base network as IP/prefix, e.g. 192.168.1.0/24.' };

  const basePrefix = Number(match[2]);
  if (!Number.isInteger(basePrefix) || basePrefix < 0 || basePrefix > 32) {
    return { ok: false, error: 'Base prefix length must be between 0 and 32.' };
  }

  const octets = parseIpv4(match[1].trim());
  if (!octets) return { ok: false, error: 'Not a valid IPv4 address.' };

  let newPrefix: number;
  if (mode === 'newPrefix') {
    newPrefix = param;
  } else {
    if (!Number.isInteger(param) || param < 1) return { ok: false, error: 'Subnet count must be a positive integer.' };
    newPrefix = basePrefix + Math.ceil(Math.log2(param));
  }

  if (!Number.isInteger(newPrefix) || newPrefix < basePrefix || newPrefix > 32) {
    return { ok: false, error: `The resulting prefix (/${newPrefix}) must be between the base /${basePrefix} and /32.` };
  }

  const subnetCount = 2 ** (newPrefix - basePrefix);
  if (subnetCount > MAX_SUBNETS) {
    return { ok: false, error: `That would produce ${subnetCount} subnets — this tool caps out at ${MAX_SUBNETS}.` };
  }

  const baseNetworkValue = ipv4ToInt(octets) & ipv4Mask(basePrefix);
  const subnetSize = 2 ** (32 - newPrefix);

  const subnets: CidrInfo[] = [];
  for (let i = 0; i < subnetCount; i++) {
    const subnetAddress = formatIpv4(intToIpv4(baseNetworkValue + i * subnetSize));
    const info = calculateCidr(`${subnetAddress}/${newPrefix}`);
    if (info) subnets.push(info);
  }

  return { ok: true, subnets };
}
