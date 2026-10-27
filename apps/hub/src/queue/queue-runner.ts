import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import type { HubJobId, HubJobOutcome } from '@dude/contracts/hub';
import type { JobRunReport } from '../jobs/job-status.js';
import { WorkerJobError } from '../workers/worker-pool.js';
import type { WorkerRunner } from '../workers/worker-pool.js';
import { JobAbortedError, PermanentJobError } from './job-error.js';
import type { ClaimedJob, JobQueue } from './job-queue.js';
import { DEFAULT_LEASE_MS } from './job-queue.js';
import type { JobHandler, JobHandlers, JobResult } from './job-kinds.js';
import { redactJobError } from './redact.js';

/** A recurring enqueue: the runner adds `kind` every `intervalMs` (idempotent while the previous one is still queued or running). */
export interface QueueSchedule {
  kind: string;
  intervalMs: number;
  payload?: unknown;
  priority?: number;
}

/** The slice of the job registry the runner reports into (`jobs/job-status.ts`). */
export interface RunnerJobRegistry {
  register(id: HubJobId, intervalMs: number): void;
  track<T>(id: HubJobId, run: () => T, classify?: (result: Awaited<T>) => JobRunReport): T;
  report(id: HubJobId, outcome: HubJobOutcome, summary: string): void;
}

export interface QueueRunnerOptions {
  queue: JobQueue;
  handlers: JobHandlers;
  /** Required to run any `worker`-isolation handler. */
  workers?: WorkerRunner;
  registry?: RunnerJobRegistry;
  /** The `savesphere.db` connection; holds the schedule timestamps (`meta` `queue_schedule:<kind>`). */
  db?: Db;
  schedules?: readonly QueueSchedule[];
  now?: () => number;
  /** Jobs running at once, inline and worker together (default 2). */
  concurrency?: number;
  /** How often idle capacity looks for work (default 2 s). */
  pollMs?: number;
  /** Lease recovery, retention pruning and scheduled enqueues (default 60 s); also the `queue-runner` job's period. */
  maintenanceMs?: number;
  leaseMs?: number;
  /** Identifies this process in `lease_owner`; unique per runner. */
  owner?: string;
  /** Operational log line (never receives a payload or a result). */
  log?: (event: string, detail: Record<string, unknown>) => void;
}

export interface QueueRunner {
  /** Recovers expired leases, then starts polling and the maintenance timer. */
  start(): void;
  /** Stops polling, aborts running jobs (returned to the queue without losing an attempt) and shuts the worker pool down. */
  stop(): Promise<void>;
  /** One claim pass: starts jobs up to the concurrency limit; resolves when they were started (not finished). */
  pump(): void;
  /** Resolves when no job is running (specs). */
  idle(): Promise<void>;
  /** One maintenance pass (recovery, pruning, scheduled enqueues); returns a short summary of what it changed. */
  maintain(): string | undefined;
}

export const QUEUE_SCHEDULE_META_PREFIX = 'queue_schedule:';
export const DEFAULT_QUEUE_MAINTENANCE_MS = 60_000;

const reportOf = (result: JobResult): JobRunReport => ({ outcome: result.attention === true ? 'failed' : 'success', summary: result.summary });

/**
 * Claims jobs from the durable queue and runs them (32-SS1, PD-147). `inline` handlers run in the Hub process under a timeout and
 * abort signal; `worker` handlers run in an isolated child through `WorkerRunner`. A lease is taken at claim and renewed while the
 * job runs; a Hub or worker that dies leaves an expiring lease which `maintain` (at start and every `maintenanceMs`) returns to the
 * queue. Retry, backoff and dead-lettering are the queue's (`JobQueue.fail`); this class only decides whether a failure is
 * retryable. A kind without a handler fails permanently. Nothing here is reachable from a route: it runs what Hub code enqueued.
 */
export function createQueueRunner(options: QueueRunnerOptions): QueueRunner {
  const { queue, handlers } = options;
  const now = options.now ?? Date.now;
  const concurrency = Math.max(1, Math.trunc(options.concurrency ?? 2));
  const pollMs = options.pollMs ?? 2000;
  const maintenanceMs = options.maintenanceMs ?? DEFAULT_QUEUE_MAINTENANCE_MS;
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const owner = options.owner ?? `hub-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const log = options.log ?? ((): void => undefined);
  const running = new Map<string, { abort: (reason: JobAbortedError) => void; settled: Promise<void> }>();
  let stopped = true;
  let pollTimer: NodeJS.Timeout | undefined;
  let maintenanceTimer: NodeJS.Timeout | undefined;

  const claimable = (): string[] => Object.keys(handlers);

  async function execute(job: ClaimedJob, handler: JobHandler, controller: AbortController): Promise<JobResult> {
    const { signal } = controller;
    const abortError = (): Error => (signal.reason instanceof Error ? signal.reason : new JobAbortedError('The job was cancelled.', 'shutdown'));
    const progress = (): void => undefined;
    if (handler.isolation === 'worker') {
      if (options.workers === undefined) throw new PermanentJobError('No worker pool is available for this job.');
      return options.workers.run(
        { jobId: job.id, kind: job.kind, payload: job.payload, attempt: job.attempt, timeoutMs: handler.timeoutMs, memoryLimitMb: handler.memoryLimitMb },
        { signal },
      );
    }
    const timer = setTimeout(() => controller.abort(new JobAbortedError(`The job did not finish within ${handler.timeoutMs} ms.`, 'timeout')), handler.timeoutMs);
    try {
      const aborted = new Promise<never>((_, reject) => {
        if (signal.aborted) reject(abortError());
        else signal.addEventListener('abort', () => reject(abortError()), { once: true });
      });
      aborted.catch(() => undefined);
      return await Promise.race([handler.run({ job: { id: job.id, kind: job.kind, payload: job.payload, attempt: job.attempt }, signal, progress }), aborted]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function runJob(job: ClaimedJob, controller: AbortController): Promise<void> {
    const handler = Object.prototype.hasOwnProperty.call(handlers, job.kind) ? handlers[job.kind] : undefined;
    const heartbeat = setInterval(() => {
      try {
        if (!queue.heartbeat(job.id, owner, leaseMs)) controller.abort(new JobAbortedError('The job lease was lost.', 'lease-lost'));
      } catch (error) { log('queue.heartbeat-failed', { jobId: job.id, error: redactJobError(error) }); }
    }, Math.max(10, Math.floor(leaseMs / 3)));
    try {
      if (handler === undefined) {
        queue.fail(job.id, owner, 'No handler is registered for this kind of job.', { retryable: false });
        return;
      }
      let result: JobResult;
      try {
        const attempt = (): Promise<JobResult> => execute(job, handler, controller);
        result = options.registry !== undefined && handler.hubJobId !== undefined
          ? await options.registry.track(handler.hubJobId, attempt, reportOf)
          : await attempt();
      } catch (error) {
        const reason: unknown = controller.signal.aborted ? controller.signal.reason : undefined;
        if (reason instanceof JobAbortedError && reason.reason === 'shutdown') { queue.release(job.id, owner); return; }
        const retryable = !(error instanceof PermanentJobError) && !(error instanceof WorkerJobError && !error.retryable);
        const outcome = queue.fail(job.id, owner, error, { retryable });
        log('queue.job-failed', { jobId: job.id, kind: job.kind, attempt: job.attempt, outcome, ...(error instanceof WorkerJobError ? { code: error.code } : {}) });
        if (outcome === 'dead') options.registry?.report('queue-runner', 'failed', `A ${job.kind} job used all ${job.maxAttempts} attempts.`);
        return;
      }
      if (!queue.complete(job.id, owner, { summary: result.summary, ...(result.data === undefined ? {} : { data: result.data }) })) {
        log('queue.completion-lost', { jobId: job.id, kind: job.kind });
      }
    } catch (error) {
      // The database itself failed; the lease expires and the job is retried. Never throws out of a timer.
      log('queue.job-error', { jobId: job.id, kind: job.kind, error: redactJobError(error) });
    } finally {
      clearInterval(heartbeat);
    }
  }

  function pump(): void {
    if (stopped) return;
    while (running.size < concurrency) {
      let job: ClaimedJob | undefined;
      try { job = queue.claim(owner, { leaseMs, kinds: claimable() }); } catch (error) {
        log('queue.claim-failed', { error: redactJobError(error) });
        return;
      }
      if (job === undefined) return;
      const controller = new AbortController();
      const claimed = job;
      const settled = runJob(claimed, controller).finally(() => { running.delete(claimed.id); if (!stopped) setImmediate(pump); });
      running.set(claimed.id, { abort: (reason) => controller.abort(reason), settled });
    }
  }

  const schedule = (): number => {
    if (options.db === undefined || options.schedules === undefined) return 0;
    let enqueued = 0;
    for (const entry of options.schedules) {
      const metaKey = `${QUEUE_SCHEDULE_META_PREFIX}${entry.kind}`;
      const last = Number(getMeta(options.db, metaKey) ?? Number.NaN);
      const at = now();
      if (Number.isFinite(last) && at - last < entry.intervalMs && at >= last) continue;
      const added = queue.enqueue({ kind: entry.kind, payload: entry.payload ?? {}, idempotencyKey: `schedule:${entry.kind}`, priority: entry.priority ?? -10 });
      setMeta(options.db, metaKey, String(at));
      if (added.created) enqueued += 1;
    }
    return enqueued;
  };

  function maintain(): string | undefined {
    const notes: string[] = [];
    try {
      const recovered = queue.recoverExpired();
      if (recovered.requeued > 0) notes.push(`${recovered.requeued} interrupted job${recovered.requeued === 1 ? '' : 's'} returned to the queue`);
      if (recovered.dead > 0) notes.push(`${recovered.dead} job${recovered.dead === 1 ? '' : 's'} gave up after repeated interruptions`);
      const pruned = queue.prune();
      if (pruned > 0) notes.push(`${pruned} old job record${pruned === 1 ? '' : 's'} removed`);
      const enqueued = schedule();
      if (enqueued > 0) notes.push(`${enqueued} scheduled job${enqueued === 1 ? '' : 's'} queued`);
    } catch (error) {
      log('queue.maintenance-failed', { error: redactJobError(error) });
      options.registry?.report('queue-runner', 'failed', 'Queue maintenance failed.');
      return undefined;
    }
    if (notes.length === 0) return undefined;
    const summary = `${notes.join('; ')}.`.replace(/^./, (c) => c.toUpperCase());
    options.registry?.report('queue-runner', 'success', summary);
    return summary;
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      options.registry?.register('queue-runner', maintenanceMs);
      for (const entry of options.schedules ?? []) {
        const handler = Object.prototype.hasOwnProperty.call(handlers, entry.kind) ? handlers[entry.kind] : undefined;
        if (handler?.hubJobId !== undefined) options.registry?.register(handler.hubJobId, entry.intervalMs);
      }
      // Crash recovery first: whatever a previous Hub process left leased is requeued (or dead-lettered) before polling begins.
      const summary = maintain();
      options.registry?.report('queue-runner', 'success', summary ?? 'Queue runner started.');
      pollTimer = setInterval(pump, pollMs);
      pollTimer.unref();
      maintenanceTimer = setInterval(maintain, maintenanceMs);
      maintenanceTimer.unref();
      pump();
    },

    pump,
    maintain,

    async idle() {
      while (running.size > 0) await Promise.all([...running.values()].map((entry) => entry.settled));
    },

    async stop() {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      if (maintenanceTimer) clearInterval(maintenanceTimer);
      pollTimer = undefined;
      maintenanceTimer = undefined;
      for (const entry of running.values()) entry.abort(new JobAbortedError('The Hub is shutting down.', 'shutdown'));
      await options.workers?.shutdown();
      await Promise.all([...running.values()].map((entry) => entry.settled));
    },
  };
}
