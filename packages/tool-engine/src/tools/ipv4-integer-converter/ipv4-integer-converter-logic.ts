/** Pure, framework-free IPv4 <-> 32-bit unsigned integer conversion, built on the shared `ip-math.ts` primitives. */
import { formatIpv4, intToIpv4, ipv4ToInt, parseIpv4 } from "../ip-address-inspector/ip-math.js";

export type Ipv4IntDirection = 'ip-to-int' | 'int-to-ip';

export type Ipv4IntConvertResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

export function convertIpv4Integer(input: string, direction: Ipv4IntDirection): Ipv4IntConvertResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: direction === 'ip-to-int' ? 'Enter an IPv4 address.' : 'Enter an integer.' };

  if (direction === 'ip-to-int') {
    const octets = parseIpv4(trimmed);
    if (!octets) return { ok: false, error: 'Not a valid IPv4 address.' };
    return { ok: true, output: String(ipv4ToInt(octets)) };
  }

  if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'Enter an integer between 0 and 4294967295.' };
  const value = Number(trimmed);
  if (value > 0xffffffff) return { ok: false, error: 'Enter an integer between 0 and 4294967295.' };

  return { ok: true, output: formatIpv4(intToIpv4(value)) };
}
