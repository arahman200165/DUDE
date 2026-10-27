import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ErrorEnvelope, HUB_QUEUE_PATH, HubQueueStatusResponse } from '@dude/contracts/hub';
import type { createRequireOwner } from '../../auth/owner-auth.js';
import { UNAVAILABLE_QUEUE_STATUS } from '../../queue/job-queue.js';

export interface QueueRouteOptions {
  requireOwner: ReturnType<typeof createRequireOwner>;
  /** The queue's read model, supplied by `run` once `savesphere.db` is open; absent on a Hub that never provisioned SaveSphere. */
  status: (() => HubQueueStatusResponse) | undefined;
}

/**
 * `GET /queue`. Credential type: owner cookie or bearer session. A read model of the durable queue (PD-147): counts by state and
 * kind, the oldest waiting job and recent failures with redacted notes, never a payload or a result. Read-only like `GET /jobs`
 * (no CSRF, no audit event). There is deliberately no route that enqueues, cancels, retries or runs a job.
 */
export function registerQueueRoute(app: FastifyInstance, options: QueueRouteOptions): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    HUB_QUEUE_PATH,
    { preHandler: options.requireOwner, schema: { response: { 200: HubQueueStatusResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (_request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      return reply.code(200).send(options.status?.() ?? UNAVAILABLE_QUEUE_STATUS);
    },
  );
}
