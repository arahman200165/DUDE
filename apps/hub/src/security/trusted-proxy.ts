import { BlockList, isIPv4, isIPv6 } from 'node:net';

export type TrustMatcher = (address: string | undefined) => boolean;

/** Strips an IPv6 zone and unwraps IPv4-mapped IPv6 (`::ffff:10.0.0.1`), so one rule covers both spellings. */
export function normalizePeerAddress(address: string): string {
  const bare = (address.split('%')[0] ?? address).toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(bare);
  return mapped?.[1] ?? bare;
}

/**
 * Matches a peer address against operator-configured IP literals and CIDRs (already validated by the config parser).
 * An unknown or missing address is never trusted.
 */
export function createTrustMatcher(entries: readonly string[]): TrustMatcher {
  const list = new BlockList();
  for (const entry of entries) {
    const slash = entry.indexOf('/');
    const address = slash < 0 ? entry : entry.slice(0, slash);
    const family = isIPv4(address) ? 'ipv4' : isIPv6(address) ? 'ipv6' : null;
    if (family === null) continue;
    if (slash < 0) list.addAddress(address, family);
    else list.addSubnet(address, Number(entry.slice(slash + 1)), family);
  }
  return (address) => {
    if (address === undefined || address.length === 0) return false;
    const peer = normalizePeerAddress(address);
    const family = isIPv4(peer) ? 'ipv4' : isIPv6(peer) ? 'ipv6' : null;
    return family !== null && list.check(peer, family);
  };
}

/**
 * Fastify `trustProxy` value: only ONE hop (the immediate peer) is trusted, and only when it is a configured proxy, so
 * `request.ip` is the last `X-Forwarded-For` entry the trusted proxy appended and spoofed earlier entries are ignored.
 */
export function trustProxyFor(entries: readonly string[] | undefined): false | ((address: string, hop: number) => boolean) {
  if (entries === undefined) return false;
  const matches = createTrustMatcher(entries);
  return (address, hop) => hop === 0 && matches(address);
}
