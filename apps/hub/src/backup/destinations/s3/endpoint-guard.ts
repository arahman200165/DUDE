import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { isIP } from 'node:net';
import { DestinationError } from '../destination.js';

/**
 * The S3 endpoint SSRF guard (32-SS1, Milestone 848). The endpoint is owner-configured, but a hand-edited `hub.json` or a hostile
 * DNS answer must not turn the Hub into a proxy to the cloud metadata service or the owner's LAN. Three classes of address:
 *
 * - `forbidden`: link-local (169.254.0.0/16, fe80::/10), the metadata addresses outside it (AWS IPv6 `fd00:ec2::/32`, Azure
 *   `168.63.129.16`, Alibaba `100.100.100.200`), the unspecified, multicast and broadcast addresses. NEVER allowed.
 * - `private`: loopback, RFC 1918, CGNAT 100.64.0.0/10, unique-local fc00::/7 and the other special-use ranges. Allowed only when
 *   the owner set `allowPrivateNetwork` (MinIO on the LAN is a real use).
 * - `public`: everything else.
 *
 * The check runs on the literal address at construction and on EVERY resolution at connect time (`guardedLookup`, pinned into the
 * socket by the transport), so a name that later resolves elsewhere (DNS rebinding) is refused too. Redirects are never followed.
 */
export type AddressClass = 'public' | 'private' | 'forbidden';

function ipv4Parts(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return numbers.every((n) => n >= 0 && n <= 255) ? numbers : null;
}

/** Expands an IPv6 literal to eight 16-bit groups, or null. Handles `::` and an embedded IPv4 tail. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail !== null) {
    const v4 = ipv4Parts(tail[1] as string);
    if (v4 === null) return null;
    text = `${text.slice(0, text.length - (tail[1] as string).length)}${(((v4[0] as number) << 8) | (v4[1] as number)).toString(16)}:${(((v4[2] as number) << 8) | (v4[3] as number)).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] === '' ? [] : (halves[0] as string).split(':');
  const rest = halves.length === 2 ? (halves[1] === '' ? [] : (halves[1] as string).split(':')) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill('0'), ...rest].map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every((g) => !Number.isNaN(g)) ? groups : null;
}

function classifyV4(p: number[]): AddressClass {
  const [a, b, c] = p as [number, number, number, number];
  if (a === 169 && b === 254) return 'forbidden';
  if (a === 168 && b === 63 && c === 129 && p[3] === 16) return 'forbidden';
  if (a === 100 && b === 100 && c === 100 && p[3] === 200) return 'forbidden';
  if (a === 0 || a >= 224) return 'forbidden';
  if (a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return 'private';
  if (a === 192 && b === 0 && c === 0) return 'private';
  if (a === 198 && (b === 18 || b === 19)) return 'private';
  if ((a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return 'private';
  return 'public';
}

/** Classifies an IP literal. An unparseable value is `forbidden`. */
export function classifyAddress(address: string): AddressClass {
  const family = isIP(address.replace(/^\[|\]$/g, ''));
  const bare = address.replace(/^\[|\]$/g, '');
  if (family === 4) {
    const parts = ipv4Parts(bare);
    return parts === null ? 'forbidden' : classifyV4(parts);
  }
  if (family === 6) {
    const g = ipv6Groups(bare);
    if (g === null) return 'forbidden';
    const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
    if (g.every((x) => x === 0)) return 'forbidden'; // ::
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) return 'private'; // ::1
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0xffff || g5 === 0)) return classifyV4([g6 >> 8, g6 & 255, g7 >> 8, g7 & 255]); // ::ffff:a.b.c.d and ::a.b.c.d
    if (g0 === 0x64 && g1 === 0xff9b) return classifyV4([g6 >> 8, g6 & 255, g7 >> 8, g7 & 255]); // NAT64 64:ff9b::/96
    if ((g0 & 0xffc0) === 0xfe80) return 'forbidden'; // fe80::/10 link-local
    if (g0 === 0xfd00 && g1 === 0x0ec2) return 'forbidden'; // AWS IPv6 instance metadata fd00:ec2::/32
    if ((g0 & 0xff00) === 0xff00) return 'forbidden'; // multicast
    if ((g0 & 0xfe00) === 0xfc00) return 'private'; // unique local fc00::/7
    if (g0 === 0x2001 && g1 === 0x0db8) return 'private'; // documentation
    return 'public';
  }
  return 'forbidden';
}

export interface EndpointPolicy {
  allowPrivateNetwork: boolean;
}

/** Throws a `bad-endpoint` refusal naming the class, never the address or the host. */
export function assertAddressAllowed(address: string, policy: EndpointPolicy): void {
  const klass = classifyAddress(address);
  if (klass === 'forbidden') throw new DestinationError('bad-endpoint', 'The S3 endpoint resolves to a link-local, metadata or otherwise reserved address and is refused.');
  if (klass === 'private' && !policy.allowPrivateNetwork) {
    throw new DestinationError('bad-endpoint', 'The S3 endpoint resolves to a loopback or private-network address; set allowPrivateNetwork on the destination to use one.');
  }
}

/** Checks a literal-IP host (the resolver is not consulted for one). Names are checked when they resolve. */
export function assertHostAllowed(hostname: string, policy: EndpointPolicy): void {
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (isIP(bare) !== 0) assertAddressAllowed(bare, policy);
}

export type ResolveAll = (hostname: string) => Promise<LookupAddress[]>;

const defaultResolveAll: ResolveAll = (hostname) =>
  new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });

/**
 * A `lookup` for `http.request`/`net.connect`: resolves every address of the name, refuses the connection when ANY of them is
 * not allowed (a name that mixes a public and a metadata address is hostile), and hands the socket the first allowed one.
 */
export function guardedLookup(policy: EndpointPolicy, resolveAll: ResolveAll = defaultResolveAll) {
  return (hostname: string, options: LookupOptions, callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void): void => {
    resolveAll(hostname).then((addresses) => {
      if (addresses.length === 0) throw new DestinationError('network', 'The S3 endpoint host did not resolve.');
      for (const entry of addresses) assertAddressAllowed(entry.address, policy);
      if (options.all === true) callback(null, addresses);
      else callback(null, (addresses[0] as LookupAddress).address, (addresses[0] as LookupAddress).family);
    }).catch((error: unknown) => {
      callback(error instanceof DestinationError ? error : new DestinationError('network', 'The S3 endpoint host could not be resolved.'), []);
    });
  };
}
