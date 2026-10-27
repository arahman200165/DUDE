import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ErrorEnvelope, HUB_TUNNEL_DISCLOSURE, HUB_TUNNEL_PATH, HubTunnelStatusResponse } from '@dude/contracts/hub';
import type { createRequireOwner } from '../../auth/owner-auth.js';

export interface TunnelRouteOptions {
  requireOwner: ReturnType<typeof createRequireOwner>;
  /**
   * The tunnel read model, supplied by `run` from the tunnel runtime (a request handler never imports the secret store or the
   * supervisor). Absent in contexts without a runtime, which report the tunnel as not configured.
   */
  status: (() => HubTunnelStatusResponse) | undefined;
}

/** What a Hub without a tunnel runtime reports. */
export const unconfiguredTunnelStatus = (): HubTunnelStatusResponse => ({
  configured: false, enabled: false, hostname: null, supported: process.platform === 'win32', state: 'not-configured', ready: false, tokenPresent: false,
  restarts: 0, lastError: null, startedAt: null, lastReadyAt: null, dashboard: null, disclosure: [...HUB_TUNNEL_DISCLOSURE], logTail: [],
});

/**
 * `GET /tunnel`. Credential type: owner cookie or bearer session. A read model of the managed Cloudflare Tunnel (PD-142, PD-143): the
 * state, the hostname, the values the owner enters in the Cloudflare dashboard, a bounded redacted log tail, the edge-TLS disclosure and
 * token PRESENCE (never the token). Read-only like `GET /jobs` and `GET /provisioning` (no CSRF, no audit event): turning the tunnel
 * on or off, and storing its connector token, are elevated admin-pipe commands, so no owner-session route can widen exposure.
 */
export function registerTunnelRoute(app: FastifyInstance, options: TunnelRouteOptions): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    HUB_TUNNEL_PATH,
    { preHandler: options.requireOwner, schema: { response: { 200: HubTunnelStatusResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (_request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      let status: HubTunnelStatusResponse;
      try {
        status = options.status?.() ?? unconfiguredTunnelStatus();
      } catch {
        status = unconfiguredTunnelStatus();
      }
      return reply.code(200).send(status);
    },
  );
}
