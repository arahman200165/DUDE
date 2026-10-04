import { isIP } from 'node:net';
import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import type { ReachabilityEchoResponse, ReachabilityScope } from '@dude/contracts/hub';
import { normalizePeerAddress } from '../security/trusted-proxy.js';
import { classifyAddress } from './addresses.js';

/**
 * Hub-observed external reachability (PD-065). No third-party probe and no client trust: a client outside the network calls the
 * Hub through its public name, and the Hub itself classifies the request's source address. Only the scope is ever returned or
 * stored, never the address.
 */
export const REACHABILITY_META_KEY = 'reachability_last';
export const REACHABILITY_FRESH_MS = 7 * 24 * 3600_000;
/** A record this young suppresses a repeat audit event. */
export const REACHABILITY_AUDIT_QUIET_MS = 24 * 3600_000;

export interface ReachabilityRecord { at: string; host: string; scope: 'public'; viaProxy: boolean }
export interface ReachabilityStatus { at: string; host: string; ageMs: number }

export function readReachability(db: Db, now: number): ReachabilityStatus | null {
  const raw = getMeta(db, REACHABILITY_META_KEY);
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReachabilityRecord>;
    const at = typeof parsed.at === 'string' ? Date.parse(parsed.at) : Number.NaN;
    if (Number.isNaN(at) || typeof parsed.host !== 'string') return null;
    return { at: parsed.at as string, host: parsed.host, ageMs: Math.max(0, now - at) };
  } catch { return null; }
}

/** True when the Hub has a fresh (7 days) observation of a public client reaching it by name. A later readiness gate uses this. */
export function reachabilityVerified(db: Db, now: number): boolean {
  const status = readReachability(db, now);
  return status !== null && status.ageMs <= REACHABILITY_FRESH_MS;
}

export interface EchoInput {
  /** `request.ip`: the socket peer, or the trusted-proxy client address in reverse-proxy mode. */
  ip: string | undefined;
  /** The effective Host (`X-Forwarded-Host` from a trusted proxy, else `Host`), with or without a port. */
  host: string | undefined;
  /** Configured names (`exposure.names`). */
  names: readonly string[];
  /** The reverse-proxy public origin when proxy mode is configured. */
  publicOrigin?: string | undefined;
  /** The request arrived through a trusted reverse proxy. */
  viaProxy: boolean;
  now: number;
}

/** Hostname only (lower case, no port, no brackets); null when unparsable. */
export function hostnameOf(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') return null;
  try {
    const name = new URL(`https://${value.trim()}`).hostname.toLowerCase();
    return name.startsWith('[') && name.endsWith(']') ? name.slice(1, -1) : name;
  } catch { return null; }
}

/** Hostname of a proxy `publicOrigin` URL; null when absent or unparsable. */
function originHostname(origin: string | undefined): string | null {
  if (origin === undefined) return null;
  try { return new URL(origin).hostname.toLowerCase(); } catch { return null; }
}

export function observedScope(ip: string | undefined): ReachabilityScope {
  if (ip === undefined || ip === '') return 'unknown';
  const address = normalizePeerAddress(ip);
  if (isIP(address) === 0) return 'unknown';
  if (address === '::' || address === '0.0.0.0') return 'unknown';
  if (isIP(address) === 4) {
    const first = Number(address.split('.')[0]);
    if (first === 0 || first >= 224) return 'unknown';
  }
  return classifyAddress(address);
}

const WHY: Record<Exclude<ReachabilityScope, 'public'>, string> = {
  private: 'This request came from a private address, so it does not show the Hub is reachable from the Internet.',
  cgnat: 'This request came from a carrier-grade NAT address (100.64.0.0/10), so it does not show the Hub is reachable from the Internet.',
  'link-local': 'This request came from a link-local address, so it does not show the Hub is reachable from the Internet.',
  'unique-local': 'This request came from a private IPv6 address, so it does not show the Hub is reachable from the Internet.',
  loopback: 'This request came from the Hub machine itself, so it does not show the Hub is reachable from the Internet.',
  unknown: 'The Hub could not classify the address this request came from, so nothing was verified.',
};

/** Pure: classifies one echo request. `record` is true exactly when `verified` is. */
export function evaluateEcho(input: EchoInput): { response: ReachabilityEchoResponse; record: boolean } {
  const scope = observedScope(input.ip);
  const host = hostnameOf(input.host);
  const publicHost = originHostname(input.publicOrigin);
  const configured = new Set(input.names.map((n) => hostnameOf(n)).filter((n): n is string => n !== null));
  if (publicHost !== null) configured.add(publicHost);
  const literal = host !== null && isIP(host) !== 0;
  const hostMatchesConfiguredName = host !== null && !literal && configured.has(host);
  // Proxy mode proves reachability only through the proxy's public origin host; direct mode is HTTPS by construction.
  const hostOk = hostMatchesConfiguredName && (!input.viaProxy || host === publicHost);
  const verified = scope === 'public' && hostOk;
  let reason: string;
  if (verified) reason = `The Hub saw this request arrive from a public Internet address through ${host}, so it is reachable from outside.`;
  else if (scope !== 'public') reason = WHY[scope as keyof typeof WHY];
  else if (literal) reason = 'This request used an IP address instead of a name, so it does not prove the Hub is reachable by its public name. Open the Hub through its DNS name.';
  else if (input.viaProxy && hostMatchesConfiguredName) reason = 'This request did not use the reverse proxy public origin, so it does not prove the public name is reachable. Open the Hub through the proxy public address.';
  else reason = 'This request came from a public address but not through a name configured on this Hub, so nothing was verified. Add the name with "dude-hub tls names add" and open the Hub through it.';
  return {
    record: verified,
    response: { observed: { scope, viaProxy: input.viaProxy }, host: input.host ?? '', hostMatchesConfiguredName, verified, reason, at: new Date(input.now).toISOString() },
  };
}

/** Stores the last verified observation (replacing any older one). Returns true when an audit event is due (no record younger than 24 h). */
export function recordReachability(db: Db, response: ReachabilityEchoResponse, now: number): boolean {
  const previous = readReachability(db, now);
  const record: ReachabilityRecord = { at: response.at, host: response.host, scope: 'public', viaProxy: response.observed.viaProxy };
  setMeta(db, REACHABILITY_META_KEY, JSON.stringify(record));
  return previous === null || previous.ageMs > REACHABILITY_AUDIT_QUIET_MS;
}
