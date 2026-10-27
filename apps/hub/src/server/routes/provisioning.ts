import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ErrorEnvelope, HUB_PROVISIONING_PATH, HubProvisioningResponse } from '@dude/contracts/hub';
import type { createRequireOwner } from '../../auth/owner-auth.js';
import { unprovisionedReport } from '../../provisioning/report.js';

export interface ProvisioningRouteOptions {
  requireOwner: ReturnType<typeof createRequireOwner>;
  /**
   * The provisioning read model, supplied by `run` (the secret store, the content store and the probes are never imported by a
   * request handler). Absent in contexts that cannot check, which then report as not provisioned.
   */
  status: (() => Promise<HubProvisioningResponse>) | undefined;
}

/**
 * `GET /provisioning`. Credential type: owner cookie or bearer session. A read model of the SaveSphere components (PD-118, PD-153):
 * a state and one short non-secret sentence each, presence-only secret status and the copyable commands. Read-only like
 * `GET /jobs` (no CSRF, no audit event): provisioning is the elevated `dude-hub provision` command on the Hub machine, and there is
 * deliberately no route that creates, changes or widens anything.
 */
export function registerProvisioningRoute(app: FastifyInstance, options: ProvisioningRouteOptions): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    HUB_PROVISIONING_PATH,
    { preHandler: options.requireOwner, schema: { response: { 200: HubProvisioningResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (_request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      let report: HubProvisioningResponse;
      try {
        report = (await options.status?.()) ?? unprovisionedReport(new Date());
      } catch {
        report = unprovisionedReport(new Date());
      }
      return reply.code(200).send(report);
    },
  );
}
