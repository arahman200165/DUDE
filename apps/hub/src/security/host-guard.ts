import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { formatHostHeader, normalizeHubName } from '../config/hub-config.js';
import type { HubBindMode } from '../config/hub-config.js';
import { envelope } from '../server/errors.js';

export interface HostGuardConfig {
  bind: HubBindMode;
  /** Operator names from `exposure.names`: a name with an explicit port is allowed only with that port, others use the listen port. */
  names?: readonly string[];
  /** Additional names (tests); treated like `names`. */
  extraHosts?: readonly string[];
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
  isAllowed(host: string | undefined): boolean;
  /** Replaces the configured names (a running service picks up `tls names add|remove` without a restart). */
  setNames(names: readonly string[]): void;
}

/** `getPort` is read lazily so tests can listen on port 0. The interface set is cached for 30 s. */
export function createHostGuard(initial: HostGuardConfig, getPort: () => number): HostGuard {
  let config: HostGuardConfig = { ...initial };
  let cachedPort = -1;
  let cachedAt = 0;
  let cached = new Set<string>();
  return {
    isAllowed(host) {
      const port = getPort();
      const now = Date.now();
      if (port !== cachedPort || now - cachedAt > 30_000) {
        cached = allowedHosts(config, port);
        cachedPort = port;
        cachedAt = now;
      }
      return isHostAllowed(host, config, port, cached);
    },
    setNames(names) {
      config = { ...config, names: [...names] };
      cachedPort = -1;
    },
  };
}

export function registerHostGuard(app: FastifyInstance, guard: HostGuard): void {
  app.addHook('onRequest', async (request, reply) => {
    if (guard.isAllowed(request.headers.host)) return;
    return reply.code(421).type('application/json').header('Cache-Control', 'no-store').send(envelope('bad-request', 'Misdirected request.'));
  });
}
