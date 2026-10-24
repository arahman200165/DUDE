import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ErrorEnvelope, HUB_PRESENCE_PATH, PresenceResponse } from '@dude/contracts/hub';
import type { createRequireOwner } from '../../auth/owner-auth.js';
import type { RealtimeHub } from '../../realtime/realtime.js';

export interface PresenceRouteOptions { realtime: RealtimeHub; requireOwner: ReturnType<typeof createRequireOwner> }

/** Credential type: owner cookie or bearer session. A live read of Hub memory (PD-108); not audited, like every read. */
export function registerPresenceRoutes(app: FastifyInstance, options: PresenceRouteOptions): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    HUB_PRESENCE_PATH,
    { preHandler: options.requireOwner, schema: { response: { 200: PresenceResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (_request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      return reply.code(200).send({ entries: options.realtime.presence() });
    },
  );
}
