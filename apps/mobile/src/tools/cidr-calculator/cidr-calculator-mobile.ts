import { calculateCidr } from '@dude/tool-engine/tools/cidr-calculator/cidr-calculator-logic';
import type { KeyValueRow, ToolRunResult } from '../../kit';

export const CIDR_ERROR = 'Enter a valid IPv4 address with a /prefix, e.g. 192.168.1.10/24.';

/** Wildcard mask (the bitwise inverse of the netmask), from the engine's dotted-quad netmask. */
export function wildcardMask(netmask: string): string {
  return netmask.split('.').map(octet => 255 - Number(octet)).join('.');
}

/** Engine result as labelled rows. The wildcard mask is mobile-side (the web tool does not show it). */
export function cidrRows(input: string): ToolRunResult {
  const info = calculateCidr(input);
  if (!info) return { ok: false, error: CIDR_ERROR };
  const rows: readonly KeyValueRow[] = [
    { key: 'network', label: 'Network', value: info.network },
    { key: 'broadcast', label: 'Broadcast', value: info.broadcast },
    { key: 'first', label: 'First usable', value: info.firstUsable },
    { key: 'last', label: 'Last usable', value: info.lastUsable },
    { key: 'hosts', label: 'Usable hosts', value: String(info.usableHosts) },
    { key: 'total', label: 'Total addresses', value: String(info.totalAddresses) },
    { key: 'netmask', label: 'Netmask', value: info.netmask },
    { key: 'wildcard', label: 'Wildcard mask', value: wildcardMask(info.netmask) },
    { key: 'prefix', label: 'Prefix length', value: `/${info.prefixLength}` },
  ];
  return { ok: true, output: rows };
}
