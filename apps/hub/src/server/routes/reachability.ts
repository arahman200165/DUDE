import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import { ErrorEnvelope, HUB_API_PREFIX, ReachabilityEchoResponse } from '@dude/contracts/hub';
import type { createRequireOwner } from '../../auth/owner-auth.js';
import type { createRequireDevice } from '../../auth/device-auth.js';
import { DEVICE_TOKEN_PREFIX } from '../../devices/device-tokens.js';
import { audit } from '../../security/audit.js';
import { effectiveHost } from '../../security/host-guard.js';
import type { HostGuard } from '../../security/host-guard.js';
import { classifyCredential } from '../../security/request-guard.js';
import { evaluateEcho, recordReachability } from '../../diagnostics/reachability.js';

export interface ReachabilityRouteOptions {
  db: Db;
  now: () => number;
  requireOwner: ReturnType<typeof createRequireOwner>;
  requireDevice: ReturnType<typeof createRequireDevice>;
  hostGuard: HostGuard;
  /** The current configured names and proxy public origin (the on-disk config can be ahead of the startup snapshot). */
  exposure: () => { names: readonly string[]; publicOrigin?: string | undefined };
}

type Resolver = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

/**
 * `GET /reachability/echo`: owner cookie/bearer session OR a device token. The credential only proves the caller may ask; the
 * result is the Hub's own observation of the request source. A device credential gains no owner rights anywhere else.
 */
export function registerReachabilityRoute(app: FastifyInstance, options: ReachabilityRouteOptions): void {
  const either: Resolver = (request, reply) => {
    const token = classifyCredential(request).bearerToken;
    return token?.startsWith(DEVICE_TOKEN_PREFIX) ? options.requireDevice(request, reply) : options.requireOwner(request, reply);
  };
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    `${HUB_API_PREFIX}/reachability/echo`,
    { preHandler: either, schema: { response: { 200: ReachabilityEchoResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 429: ErrorEnvelope } } },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      const now = options.now();
      const exposure = options.exposure();
      const { response, record } = evaluateEcho({
        ip: request.ip,
        host: effectiveHost(request),
        names: exposure.names,
        publicOrigin: exposure.publicOrigin,
        viaProxy: options.hostGuard.isTrustedPeer(request),
        now,
      });
      if (record && recordReachability(options.db, response, now)) {
        const actor = request.device !== undefined
          ? { actorKind: 'device' as const, actorId: request.device.deviceId }
          : { actorKind: 'owner' as const, ...(request.owner ? { actorId: request.owner.ownerId } : {}) };
        audit(options.db, { event: 'network.reachability-verified', outcome: 'success', ...actor, now, detail: { host: response.host, viaProxy: response.observed.viaProxy } });
      }
      return reply.code(200).send(response);
    },
  );
}
