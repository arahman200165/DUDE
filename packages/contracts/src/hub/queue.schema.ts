import Type, { type Static } from 'typebox';

/**
 * Owner read of the Hub's durable job queue (32-SS1, PD-147). Credential: owner cookie or bearer session. Read-only: there is no
 * route that enqueues, cancels, retries or runs a job (the queue runs Hub-internal work only), and the response carries counts and
 * short redacted failure notes, never a payload, a result, a path or a credential.
 */
export const HUB_QUEUE_PATH = '/api/v1/queue';

/**
 * Job lifecycle. `queued` waits (also a failed attempt waiting for its retry), `running` holds a lease, `succeeded` is done,
 * `failed` stopped without retry (the handler said the failure is permanent, or the worker exceeded its memory limit) and `dead`
 * used every attempt.
 */
export const HUB_QUEUE_STATES = ['queued', 'running', 'succeeded', 'failed', 'dead'] as const;
export type HubQueueState = (typeof HUB_QUEUE_STATES)[number];

/** Longest redacted failure note. */
export const HUB_QUEUE_ERROR_MAX = 300;
/** Most failures listed. */
export const HUB_QUEUE_RECENT_FAILURES_MAX = 20;

const Count = Type.Integer({ minimum: 0 });
const Instant = Type.Union([Type.String({ minLength: 1, maxLength: 40 }), Type.Null()]);

const StateCounts = Type.Object({ queued: Count, running: Count, succeeded: Count, failed: Count, dead: Count });
export type HubQueueStateCounts = Static<typeof StateCounts>;

export const HubQueueFailure = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64 }),
  kind: Type.String({ minLength: 1, maxLength: 64 }),
  state: Type.Union([Type.Literal('failed'), Type.Literal('dead')]),
  attempts: Count,
  maxAttempts: Count,
  finishedAt: Type.String({ minLength: 1, maxLength: 40 }),
  lastError: Type.String({ maxLength: HUB_QUEUE_ERROR_MAX }),
});
export type HubQueueFailure = Static<typeof HubQueueFailure>;

export const HubQueueStatusResponse = Type.Object({
  /** False on a Hub whose SaveSphere storage is not provisioned (no `savesphere.db`): every count is zero. */
  available: Type.Boolean(),
  counts: StateCounts,
  kinds: Type.Array(Type.Intersect([Type.Object({ kind: Type.String({ minLength: 1, maxLength: 64 }) }), StateCounts]), { maxItems: 64 }),
  /** When the oldest job still waiting to run was created; null when nothing waits. */
  oldestQueuedAt: Instant,
  recentFailures: Type.Array(HubQueueFailure, { maxItems: HUB_QUEUE_RECENT_FAILURES_MAX }),
});
export type HubQueueStatusResponse = Static<typeof HubQueueStatusResponse>;
