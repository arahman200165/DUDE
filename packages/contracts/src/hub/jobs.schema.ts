import Type, { type Static } from 'typebox';

/** Owner read of the Hub's background jobs (PD-112). Credential: owner cookie or bearer session. */
export const HUB_JOBS_PATH = '/api/v1/jobs';

/**
 * The closed list of Hub background jobs, in display order. Collaboration maintenance jobs join it with their milestones
 * (`collab-history-prune`: the daily removal of history snapshots past retention, PD-105; `collab-maintenance`: the six-hourly
 * pruning of merge bases below the sync floor and compaction of stored update tails, PD-105).
 */
export const HUB_JOB_IDS = ['leaf-renewal', 'acme-renewal', 'backup-schedule', 'sync-compaction', 'address-watch', 'audit-prune', 'collab-history-prune', 'collab-maintenance'] as const;
export type HubJobId = (typeof HUB_JOB_IDS)[number];

export const HUB_JOB_OUTCOMES = ['success', 'skipped', 'failed'] as const;
export type HubJobOutcome = (typeof HUB_JOB_OUTCOMES)[number];

/** Longest `lastSummary`: a short human sentence, never a secret, path or error stack. */
export const HUB_JOB_SUMMARY_MAX = 200;

/** The outcomes of a real attempt: a `skipped` check is never one. */
export const HUB_JOB_ATTEMPT_OUTCOMES = ['success', 'failed'] as const;
export type HubJobAttemptOutcome = (typeof HUB_JOB_ATTEMPT_OUTCOMES)[number];

const InstantString = Type.String({ minLength: 1, maxLength: 40 });

/** An ISO-8601 instant (UTC). */
const Instant = Type.Union([InstantString, Type.Null()]);

/** One job's state. Read-only: there is no way to start, stop or queue a job through the API. */
export const HubJobStatus = Type.Object({
  id: Type.Unsafe<HubJobId>({ type: 'string', enum: [...HUB_JOB_IDS] }),
  /** The timer period (for the backup schedule, its check period); 0 when the job has no timer in this process. */
  intervalMs: Type.Integer({ minimum: 0 }),
  running: Type.Boolean(),
  lastStartedAt: Instant,
  lastFinishedAt: Instant,
  lastOutcome: Type.Union([Type.Unsafe<HubJobOutcome>({ type: 'string', enum: [...HUB_JOB_OUTCOMES] }), Type.Null()]),
  lastSummary: Type.Union([Type.String({ maxLength: HUB_JOB_SUMMARY_MAX }), Type.Null()]),
  nextDueAt: Instant,
  /**
   * The most recent run whose outcome was not `skipped` (for a timer that reports checks, like the backup schedule, the last real
   * attempt); null when there has been none. Optional so a client still reads a Hub from before this field.
   */
  lastAttempt: Type.Optional(Type.Union([
    Type.Object({
      finishedAt: InstantString,
      outcome: Type.Unsafe<HubJobAttemptOutcome>({ type: 'string', enum: [...HUB_JOB_ATTEMPT_OUTCOMES] }),
      summary: Type.String({ maxLength: HUB_JOB_SUMMARY_MAX }),
    }),
    Type.Null(),
  ])),
});
export type HubJobStatus = Static<typeof HubJobStatus>;

export const HubJobsResponse = Type.Object({ jobs: Type.Array(HubJobStatus) });
export type HubJobsResponse = Static<typeof HubJobsResponse>;
