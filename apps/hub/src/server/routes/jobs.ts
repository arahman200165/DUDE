import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ErrorEnvelope, HUB_JOBS_PATH, HubJobsResponse } from '@dude/contracts/hub';
import type { createRequireOwner } from '../../auth/owner-auth.js';
import type { JobRegistry } from '../../jobs/job-status.js';

export interface JobsRouteOptions { jobs: JobRegistry; requireOwner: ReturnType<typeof createRequireOwner> }

/** Credential type: owner cookie or bearer session. Read-only status of the Hub's background jobs (PD-112); not audited, like every read. */
export function registerJobsRoute(app: FastifyInstance, options: JobsRouteOptions): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    HUB_JOBS_PATH,
    { preHandler: options.requireOwner, schema: { response: { 200: HubJobsResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (_request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      return reply.code(200).send({ jobs: options.jobs.list() });
    },
  );
}
