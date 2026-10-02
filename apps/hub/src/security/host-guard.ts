import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { HubBindMode } from '../config/hub-config.js';
import { envelope } from '../server/errors.js';

export interface HostGuardConfig {
  bind: HubBindMode;
  /** Extra operator-configured host names (without port). */
  extraHosts?: readonly string[];
}

function withPorts(name: string, port: number, into: Set<string>): void {
  const lower = name.toLowerCase();
  into.add(`${lower}:${port}`);
  if (port === 443) into.add(lower); // browsers omit the default HTTPS port
}

/**
 * The exact Host header values accepted (anti-DNS-rebinding). Loopback names, the OS host name and configured
 * extra names always; in lan/container mode also every IP literal of a local interface. Container mode
 * additionally accepts any host (see `isHostAllowed`): container hosts are mapped by the operator, so the Hub
 * cannot enumerate them; the credential-typed request guard still applies.
 */
export function allowedHosts(config: HostGuardConfig, port: number): Set<string> {
  const set = new Set<string>();
  for (const name of ['127.0.0.1', 'localhost', '[::1]', os.hostname(), ...(config.extraHosts ?? [])]) withPorts(name, port, set);
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
  if (config.bind === 'container') return true;
  return set.has(host.toLowerCase());
}

export interface HostGuard {
  isAllowed(host: string | undefined): boolean;
}

/** `getPort` is read lazily so tests can listen on port 0. The interface set is cached for 30 s. */
export function createHostGuard(config: HostGuardConfig, getPort: () => number): HostGuard {
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
  };
}

export function registerHostGuard(app: FastifyInstance, guard: HostGuard): void {
  app.addHook('onRequest', async (request, reply) => {
    if (guard.isAllowed(request.headers.host)) return;
    return reply.code(421).type('application/json').header('Cache-Control', 'no-store').send(envelope('bad-request', 'Misdirected request.'));
  });
}
