import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import { ErrorEnvelope, HUB_API_PREFIX, HubDiagnosticsReport } from '@dude/contracts/hub';
import type { OwnerContext, createRequireOwner } from '../../auth/owner-auth.js';
import { audit } from '../../security/audit.js';

export interface DiagnosticsRouteOptions {
  db: Db;
  now: () => number;
  requireOwner: ReturnType<typeof createRequireOwner>;
  collect: () => Promise<HubDiagnosticsReport>;
}

/** `GET /diagnostics`: owner cookie or bearer. View-only; redacted by construction (no secrets, no file contents). Audited without detail. */
export function registerDiagnosticsRoute(app: FastifyInstance, options: DiagnosticsRouteOptions): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    `${HUB_API_PREFIX}/diagnostics`,
    { preHandler: options.requireOwner, schema: { response: { 200: HubDiagnosticsReport, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      const ctx = request.owner as OwnerContext;
      const report = await options.collect();
      audit(options.db, { event: 'hub.diagnostics-viewed', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: request.ip || 'unknown', now: options.now() });
      return reply.code(200).send(report);
    },
  );
}
