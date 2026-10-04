import dns from 'node:dns';
import { isIPv4, isIPv6 } from 'node:net';
import os from 'node:os';

/**
 * Address inventory and DNS-name resolution for the dynamic-address checks (PD-064). The Hub never updates DNS and stores no DNS
 * credentials: it reads its own interfaces, resolves the operator's names through the system resolver, and explains any difference.
 * There is deliberately no external "what is my IP" lookup anywhere in this module.
 */
export type AddressScope = 'loopback' | 'private' | 'link-local' | 'public' | 'cgnat' | 'unique-local';
export interface HubAddress { address: string; family: 4 | 6; scope: AddressScope }

export type InterfaceMap = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

const stripZone = (address: string): string => (address.split('%')[0] ?? address).toLowerCase();

export function classifyAddress(raw: string): AddressScope {
  const address = stripZone(raw);
  if (isIPv4(address)) {
    const [a = 0, b = 0] = address.split('.').map(Number);
    if (a === 127) return 'loopback';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
    if (a === 100 && b >= 64 && b <= 127) return 'cgnat';
    if (a === 169 && b === 254) return 'link-local';
    return 'public';
  }
  if (address === '::1') return 'loopback';
  const first = Number.parseInt(address.split(':')[0] || '0', 16);
  if (first >= 0xfc00 && first <= 0xfdff) return 'unique-local';
  if (first >= 0xfe80 && first <= 0xfebf) return 'link-local';
  return 'public';
}

/** Every non-loopback interface address, sorted by address (stable across calls). Loopback is skipped in the report. */
export function listHubAddresses(ifaces: InterfaceMap = os.networkInterfaces()): HubAddress[] {
  const seen = new Map<string, HubAddress>();
  for (const list of Object.values(ifaces)) {
    for (const info of list ?? []) {
      const address = stripZone(info.address);
      const scope = classifyAddress(address);
      if (info.internal || scope === 'loopback') continue;
      seen.set(address, { address, family: isIPv6(address) ? 6 : 4, scope });
    }
  }
  return [...seen.values()].sort((a, b) => a.address.localeCompare(b.address));
}

/** `2001:db8:1:2::/64` for any IPv6 address: privacy (temporary) addresses rotate inside a prefix, the prefix is what DNS and routers care about. */
export function ipv6Prefix64(address: string): string {
  const bare = address.split('%')[0] ?? address;
  const halves = bare.split('::');
  const head = (halves[0] ?? '').split(':').filter((g) => g !== '');
  const tail = halves.length === 2 ? (halves[1] ?? '').split(':').filter((g) => g !== '') : [];
  const groups = halves.length === 2 ? [...head, ...new Array<string>(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail] : head;
  const prefix = groups.slice(0, 4).map((g) => parseInt(g || '0', 16).toString(16));
  return `${prefix.join(':')}::/64`;
}

/**
 * The addresses that count for drift: not loopback, not link-local (those change with every cable and adapter). IPv6 addresses
 * collapse to their /64 prefix so rotating privacy addresses do not read as a change; IPv4 stays exact.
 */
export const stableAddresses = (addresses: readonly HubAddress[]): string[] =>
  [...new Set(addresses.filter((a) => a.scope !== 'link-local' && a.scope !== 'loopback').map((a) => (a.address.includes(':') ? ipv6Prefix64(a.address) : a.address)))].sort();

export interface DnsResolver {
  resolve4(name: string): Promise<string[]>;
  resolve6(name: string): Promise<string[]>;
}
export type NameResolveError = 'not-found' | 'timeout' | 'failed';
export interface NameResolution { name: string; addresses: string[]; error?: NameResolveError }

export const DNS_TIMEOUT_MS = 3000;

export const systemResolver: DnsResolver = {
  resolve4: (name) => dns.promises.resolve4(name),
  resolve6: (name) => dns.promises.resolve6(name),
};

class TimeoutError extends Error { code = 'ETIMEOUT'; }

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TimeoutError('timeout')), ms); timer.unref(); });
  return Promise.race([work, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

type Outcome = { ok: string[] } | { error: NameResolveError };

async function attempt(work: () => Promise<string[]>, ms: number): Promise<Outcome> {
  try { return { ok: await withTimeout(work(), ms) }; } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'NXDOMAIN') return { error: 'not-found' };
    if (code === 'ETIMEOUT' || code === 'ETIMEDOUT') return { error: 'timeout' };
    return { error: 'failed' };
  }
}

/** Resolves each DNS name (A and AAAA, 3 s each). Addresses are the union; an error is reported only when nothing resolved. */
export async function resolveNames(names: readonly string[], resolver: DnsResolver = systemResolver, timeoutMs = DNS_TIMEOUT_MS): Promise<NameResolution[]> {
  return Promise.all(names.map(async (name): Promise<NameResolution> => {
    const [v4, v6] = await Promise.all([attempt(() => resolver.resolve4(name), timeoutMs), attempt(() => resolver.resolve6(name), timeoutMs)]);
    const addresses = [...('ok' in v4 ? v4.ok : []), ...('ok' in v6 ? v6.ok : [])].map(stripZone);
    if (addresses.length > 0) return { name, addresses: [...new Set(addresses)].sort() };
    const errors = [v4, v6].flatMap((o) => ('error' in o ? [o.error] : []));
    const error: NameResolveError = errors.includes('timeout') ? 'timeout' : errors.every((e) => e === 'not-found') ? 'not-found' : 'failed';
    return { name, addresses: [], error };
  }));
}

export const DNS_CACHE_TTL_MS = 60_000;

/** Wraps `resolveNames` with a 60 s cache per name set so the owner diagnostics page cannot be used to hammer DNS. */
export function createCachedNameResolver(options: { resolver?: DnsResolver; now?: () => number; ttlMs?: number } = {}): (names: readonly string[]) => Promise<NameResolution[]> {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? DNS_CACHE_TTL_MS;
  const cache = new Map<string, { at: number; value: NameResolution[] }>();
  return async (names) => {
    const key = [...names].sort().join('\n');
    const hit = cache.get(key);
    if (hit !== undefined && now() - hit.at < ttl) return hit.value;
    const value = await resolveNames(names, options.resolver);
    cache.set(key, { at: now(), value });
    if (cache.size > 8) cache.delete(cache.keys().next().value as string);
    return value;
  };
}

/** The DNS names to resolve: `exposure.names` and the canonical origin host, minus IP literals and `localhost`. */
export function dnsNamesToResolve(config: { names: readonly string[]; canonicalOrigin?: string; proxy?: { publicOrigin: string } }): string[] {
  const out = new Set<string>();
  const add = (raw: string): void => {
    let host = raw.trim().toLowerCase();
    const colon = host.lastIndexOf(':');
    if (colon >= 0 && !host.includes('::') && host.indexOf(':') === colon) host = host.slice(0, colon);
    host = host.replace(/^\[|\]$/g, '');
    if (host.length === 0 || host === 'localhost' || isIPv4(host) || isIPv6(host)) return;
    out.add(host);
  };
  for (const name of config.names) add(name);
  for (const origin of [config.canonicalOrigin, config.proxy?.publicOrigin]) {
    if (origin === undefined) continue;
    try { add(new URL(origin).hostname); } catch { /* an invalid origin is rejected by config validation */ }
  }
  return [...out].sort();
}
