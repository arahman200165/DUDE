import os from 'node:os';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createTrustMatcher } from './trusted-proxy.js';
import { formatHostHeader, normalizeHubName } from '../config/hub-config.js';
import type { HubBindMode } from '../config/hub-config.js';
import { envelope } from '../server/errors.js';

export interface HostGuardConfig {
  bind: HubBindMode;
  /** Operator names from `exposure.names`: a name with an explicit port is allowed only with that port, others use the listen port. */
  names?: readonly string[];
  /** Additional names (tests); treated like `names`. */
  extraHosts?: readonly string[];
  /** Reverse-proxy mode: forwarded host/protocol are honoured only from `trusted` peers. */
  proxy?: { trusted: readonly string[]; publicOrigin: string };
  /**
   * Managed tunnel mode (32-SS1, Milestone 837, PD-119, PD-143): through the trusted loopback connector the only external hosts are
   * exactly `hostname` and `www.<hostname>` (other configured names, the OS host name and interface addresses are not served
   * there), and `www.<hostname>` is redirected to the bare domain before any other handling. Requires `proxy`.
   */
  tunnel?: { hostname: string };
}

type RequestLike = Pick<FastifyRequest, 'host' | 'socket'>;

/**
 * The externally visible host of a request: `X-Forwarded-Host` when the immediate peer is a configured trusted proxy
 * (Fastify's `trustProxy` enforces that), else the `Host` header. Host guard, Origin checks and realtime all use this.
 */
export function effectiveHost(request: Pick<FastifyRequest, 'host'>): string | undefined {
  const host = request.host;
  return typeof host === 'string' && host.length > 0 ? host : undefined;
}

function withPorts(name: string, port: number, into: Set<string>): void {
  const lower = name.toLowerCase();
  into.add(`${lower}:${port}`);
  if (port === 443) into.add(lower); // browsers omit the default HTTPS port
}

const configuredNames = (config: HostGuardConfig): string[] => [...(config.names ?? []), ...(config.extraHosts ?? [])];

/**
 * The exact Host header values accepted (anti-DNS-rebinding). Loopback names, the OS host name and configured
 * names always; in lan/container mode also every IP literal of a local interface. A configured name with an explicit
 * port (a container or NAT that maps another external port) is accepted only with that port.
 * Container mode with no configured names accepts any host (see `isHostAllowed`).
 */
export function allowedHosts(config: HostGuardConfig, port: number): Set<string> {
  const set = new Set<string>();
  for (const name of ['127.0.0.1', 'localhost', '[::1]', os.hostname()]) withPorts(name, port, set);
  for (const entry of configuredNames(config)) {
    const name = normalizeHubName(entry);
    if (name.port !== undefined) set.add(formatHostHeader(name));
    else withPorts(formatHostHeader(name), port, set);
  }
  if (config.bind === 'lan' || config.bind === 'container') {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const info of list ?? []) {
        const address = info.address.split('%')[0] ?? info.address;
        withPorts(info.family === 'IPv6' ? `[${address}]` : address, port, set);
      }
    }
  }
  return set;
}

export function isHostAllowed(host: string | undefined, config: HostGuardConfig, port: number, set = allowedHosts(config, port)): boolean {
  if (host === undefined || host.length === 0) return false;
  // Back-compat: a container Hub with no configured names accepts any Host (the credential-typed request guard still
  // applies). Diagnostics will warn about this; configuring `exposure.names` turns it into an allowlist.
  if (config.bind === 'container' && configuredNames(config).length === 0) return true;
  return set.has(host.toLowerCase());
}

export interface HostGuard {
  /** Checks a bare Host value against the allowlist (listen port; in proxy mode also the public port). */
  isAllowed(host: string | undefined): boolean;
  /** Request-level check: proxy-aware (see `effectiveHost`); direct non-proxy peers are limited to loopback names. */
  isRequestAllowed(request: RequestLike): boolean;
  /** Whether `origin` is this request's own origin: `publicOrigin` or `https://<effective host>` (proxy), else `https://<Host>`. */
  originMatches(request: RequestLike, origin: string | undefined): boolean;
  /** The immediate peer is a configured trusted proxy. */
  isTrustedPeer(request: Pick<FastifyRequest, 'socket'>): boolean;
  /**
   * The bare-domain URL a `www.<domain>` request is redirected to (308, same path and query), or null when this request is not one:
   * tunnel mode only, only from the trusted connector, only for exactly `www.<domain>`. The target is built from the configured
   * public origin, never from a request header.
   */
  wwwRedirectTarget(request: RequestLike & Pick<FastifyRequest, 'raw'>): string | null;
  /** Replaces the configured names (a running service picks up `tls names add|remove` without a restart). */
  setNames(names: readonly string[]): void;
}

const LOOPBACK_NAMES = ['127.0.0.1', 'localhost', '[::1]'];
/** A request target that starts with one `/` and holds only printable ASCII: safe to append to the public origin. */
const ORIGIN_FORM = /^\/[\x21-\x7e]*$/;

/** `getPort` is read lazily so tests can listen on port 0. The interface sets are cached for 30 s. */
export function createHostGuard(initial: HostGuardConfig, getPort: () => number): HostGuard {
  let config: HostGuardConfig = { ...initial };
  const proxy = initial.proxy;
  const trusts = proxy ? createTrustMatcher(proxy.trusted) : (): boolean => false;
  const publicUrl = proxy ? new URL(proxy.publicOrigin) : null;
  const publicPort = publicUrl ? (publicUrl.port === '' ? 443 : Number(publicUrl.port)) : 0;
  const publicOrigin = proxy ? proxy.publicOrigin.toLowerCase() : '';
  const tunnelHost = initial.tunnel !== undefined && proxy !== undefined ? initial.tunnel.hostname.toLowerCase() : undefined;
  /** The names the connector may use: the bare domain and www, with and without the default HTTPS port. */
  const tunnelHosts = new Set<string>(tunnelHost === undefined ? [] : [tunnelHost, `${tunnelHost}:443`, `www.${tunnelHost}`, `www.${tunnelHost}:443`]);
  const loopbackAt = (host: string, port: number): boolean => LOOPBACK_NAMES.some((name) => host === `${name}:${port}`);
  const sets = new Map<number, Set<string>>();
  let cachedAt = 0;
  const setFor = (port: number): Set<string> => {
    const now = Date.now();
    if (now - cachedAt > 30_000) { sets.clear(); cachedAt = now; }
    let set = sets.get(port);
    if (!set) { set = allowedHosts(config, port); sets.set(port, set); }
    return set;
  };
  const allowedAt = (host: string | undefined, port: number): boolean => isHostAllowed(host, config, port, setFor(port));
  const trustedPeer = (request: Pick<FastifyRequest, 'socket'>): boolean => proxy !== undefined && trusts(request.socket?.remoteAddress);
  return {
    isAllowed(host) {
      if (tunnelHost !== undefined) return host !== undefined && (tunnelHosts.has(host.toLowerCase()) || loopbackAt(host.toLowerCase(), getPort()));
      return allowedAt(host, getPort()) || (proxy !== undefined && allowedAt(host, publicPort));
    },
    isTrustedPeer: trustedPeer,
    isRequestAllowed(request) {
      const host = effectiveHost(request);
      if (host === undefined) return false;
      const port = getPort();
      if (proxy === undefined) return allowedAt(host, port);
      if (tunnelHost !== undefined) {
        const lowerHost = host.toLowerCase();
        // Tunnel mode serves exactly the public domain and www (via the connector) and loopback names (the local desktop and admin).
        return loopbackAt(lowerHost, port) || (trustedPeer(request) && tunnelHosts.has(lowerHost));
      }
      if (trustedPeer(request)) return allowedAt(host, port) || allowedAt(host, publicPort);
      // A direct connection in proxy mode is the local admin/desktop: loopback names only.
      const lower = host.toLowerCase();
      return LOOPBACK_NAMES.some((name) => lower === `${name}:${port}`);
    },
    originMatches(request, origin) {
      const host = effectiveHost(request);
      if (origin === undefined || host === undefined) return false;
      const lower = origin.toLowerCase();
      if (proxy !== undefined && trustedPeer(request) && lower === publicOrigin) return true;
      return lower === `https://${host.toLowerCase()}`;
    },
    wwwRedirectTarget(request) {
      if (tunnelHost === undefined || !trustedPeer(request)) return null;
      const host = effectiveHost(request)?.toLowerCase();
      if (host !== `www.${tunnelHost}` && host !== `www.${tunnelHost}:443`) return null;
      const url = request.raw.url ?? '/';
      // Only an origin-form target is appended; anything else (absolute-form, authority, control or non-ASCII bytes) goes to the root.
      return `${publicOrigin}${ORIGIN_FORM.test(url) ? url : '/'}`;
    },
    setNames(names) {
      config = { ...config, names: [...names] };
      sets.clear();
    },
  };
}

export function registerHostGuard(app: FastifyInstance, guard: HostGuard): void {
  app.addHook('onRequest', async (request, reply) => {
    const redirect = guard.wwwRedirectTarget(request);
    if (redirect !== null) return reply.code(308).header('Location', redirect).header('Cache-Control', 'no-store').send();
    if (guard.isRequestAllowed(request)) return;
    return reply.code(421).type('application/json').header('Cache-Control', 'no-store').send(envelope('bad-request', 'Misdirected request.'));
  });
}
