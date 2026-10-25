import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { HUB_JOB_ATTEMPT_OUTCOMES, HUB_JOB_IDS, HUB_JOB_OUTCOMES, HUB_JOB_SUMMARY_MAX } from '@dude/contracts/hub';
import type { HubJobAttemptOutcome, HubJobId, HubJobOutcome, HubJobStatus } from '@dude/contracts/hub';

/** Meta key prefix of one job's last run (`job_last:<id>`); scrubbed from backups (`backup/snapshot.ts`). */
export const JOB_LAST_META_PREFIX = 'job_last:';

export interface JobRunReport { outcome: HubJobOutcome; summary: string }

/** What the timer modules receive: wraps one run of their job. A failing run rethrows exactly as it would without tracking. */
export interface JobHandle {
  track<T>(run: () => T, classify?: (result: Awaited<T>) => JobRunReport): T;
}

export interface JobRegistry {
  /** Declares a job's timer period (0 or less: no timer; `nextDueAt` stays null). Re-registering replaces the period. */
  register(id: HubJobId, intervalMs: number): void;
  /** Runs `run` (sync or async), recording start, finish and outcome; the result or error passes through untouched. */
  track<T>(id: HubJobId, run: () => T, classify?: (result: Awaited<T>) => JobRunReport): T;
  /** Records an already-finished run for a timer whose outcome is not simply a result or a throw. */
  report(id: HubJobId, outcome: HubJobOutcome, summary: string): void;
  handle(id: HubJobId): JobHandle;
  /** Every job in `HUB_JOB_IDS` order. */
  list(): HubJobStatus[];
  /** Called after every state change (start and finish); never throws into a job. */
  onChange: (() => void) | undefined;
  /** Called once per finished run with its outcome (notifications, PD-109); never throws into a job. */
  onFinish: ((run: JobFinish) => void) | undefined;
}

export interface JobFinish { id: HubJobId; outcome: HubJobOutcome; summary: string; finishedAt: string }

export interface JobRegistryOptions { db: Db; now?: () => number; onChange?: () => void }

interface Attempt { finishedAt: string; outcome: HubJobAttemptOutcome; summary: string }
interface Last { startedAt: string; finishedAt: string; outcome: HubJobOutcome; summary: string; attempt: Attempt | null }

const isoOf = (ms: number): string => new Date(ms).toISOString();

/** A run's summary is one short sentence; anything else is cut so a stray message can never grow the wire shape. */
function clip(summary: string): string {
  const oneLine = summary.replace(/\s+/g, ' ').trim();
  return oneLine.length <= HUB_JOB_SUMMARY_MAX ? oneLine : `${oneLine.slice(0, HUB_JOB_SUMMARY_MAX - 3)}...`;
}

/** Only a short, code-like `code` (ENOSPC, SQLITE_BUSY) ever reaches a summary; messages and stacks never do. */
function failureSummary(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(code) ? `The run failed (${code}).` : 'The run failed.';
}

/** A run is a real attempt unless it only checked and skipped. */
const attemptOf = (run: { finishedAt: string; outcome: HubJobOutcome; summary: string }): Attempt | null =>
  run.outcome === 'skipped' ? null : { finishedAt: run.finishedAt, outcome: run.outcome, summary: run.summary };

function validAttempt(value: unknown): Attempt | null {
  if (typeof value !== 'object' || value === null) return null;
  const a = value as Partial<Attempt>;
  return typeof a.finishedAt === 'string' && typeof a.summary === 'string' && (HUB_JOB_ATTEMPT_OUTCOMES as readonly unknown[]).includes(a.outcome)
    ? { finishedAt: a.finishedAt, outcome: a.outcome as HubJobAttemptOutcome, summary: a.summary }
    : null;
}

function readLast(db: Db, id: HubJobId): Last | null {
  let raw: string | undefined;
  try { raw = getMeta(db, `${JOB_LAST_META_PREFIX}${id}`); } catch { return null; }
  if (raw === undefined) return null;
  try {
    const v = JSON.parse(raw) as Partial<Last>;
    if (typeof v.startedAt === 'string' && typeof v.finishedAt === 'string' && typeof v.summary === 'string'
      && (HUB_JOB_OUTCOMES as readonly unknown[]).includes(v.outcome)) {
      const last = { startedAt: v.startedAt, finishedAt: v.finishedAt, outcome: v.outcome as HubJobOutcome, summary: v.summary };
      // A record from before `attempt` (or with an invalid one) derives it from its own outcome.
      return { ...last, attempt: validAttempt(v.attempt) ?? attemptOf(last) };
    }
  } catch { /* an unreadable record is treated as never run */ }
  return null;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';

/**
 * Read-only status of the Hub's background jobs (PD-112). Each timer module keeps its own schedule and behavior; it only
 * reports its runs here. Last-run state is persisted in meta so it survives a restart; `running` and the period are
 * per process. There is no way to start a job from here.
 */
export function createJobRegistry(options: JobRegistryOptions): JobRegistry {
  const now = options.now ?? Date.now;
  const intervals = new Map<HubJobId, number>();
  const running = new Map<HubJobId, string>();

  const changed = (): void => {
    try { registry.onChange?.(); } catch { /* a notification failure never touches a job */ }
  };
  const persist = (id: HubJobId, last: Last): void => {
    try { setMeta(options.db, `${JOB_LAST_META_PREFIX}${id}`, JSON.stringify(last)); } catch { /* the database may be closing; status is best effort */ }
  };
  const start = (id: HubJobId): void => {
    running.set(id, isoOf(now()));
    changed();
  };
  const finish = (id: HubJobId, outcome: HubJobOutcome, summary: string): void => {
    const finishedAt = isoOf(now());
    const run = { finishedAt, outcome, summary: clip(summary) };
    persist(id, { startedAt: running.get(id) ?? finishedAt, ...run, attempt: attemptOf(run) ?? readLast(options.db, id)?.attempt ?? null });
    running.delete(id);
    changed();
    try { registry.onFinish?.({ id, outcome, summary: clip(summary), finishedAt }); } catch { /* an observer failure never touches a job */ }
  };
  const finishWith = (id: HubJobId, result: unknown, classify: ((result: never) => JobRunReport) | undefined): void => {
    let report: JobRunReport = { outcome: 'success', summary: 'Completed.' };
    if (classify !== undefined) {
      try { report = classify(result as never); } catch { /* an unclassifiable result is a plain success */ }
    }
    finish(id, report.outcome, report.summary);
  };

  const registry: JobRegistry = {
    onChange: options.onChange,
    onFinish: undefined,
    register(id, intervalMs) {
      intervals.set(id, Math.max(0, Math.trunc(intervalMs)));
    },
    track<T>(id: HubJobId, run: () => T, classify?: (result: Awaited<T>) => JobRunReport): T {
      start(id);
      let result: T;
      try {
        result = run();
      } catch (error) {
        finish(id, 'failed', failureSummary(error));
        throw error;
      }
      if (isThenable(result)) {
        return Promise.resolve(result).then(
          (value) => { finishWith(id, value, classify as ((result: never) => JobRunReport) | undefined); return value; },
          (error: unknown) => { finish(id, 'failed', failureSummary(error)); throw error; },
        ) as T;
      }
      finishWith(id, result, classify as ((result: never) => JobRunReport) | undefined);
      return result;
    },
    report(id, outcome, summary) {
      running.set(id, isoOf(now()));
      finish(id, outcome, summary);
    },
    handle(id) {
      return { track: (run, classify) => registry.track(id, run, classify) };
    },
    list() {
      return HUB_JOB_IDS.map((id): HubJobStatus => {
        const last = readLast(options.db, id);
        const startedAt = running.get(id);
        const intervalMs = intervals.get(id) ?? 0;
        return {
          id,
          intervalMs,
          running: startedAt !== undefined,
          lastStartedAt: startedAt ?? last?.startedAt ?? null,
          lastFinishedAt: last?.finishedAt ?? null,
          lastOutcome: last?.outcome ?? null,
          lastSummary: last?.summary ?? null,
          lastAttempt: last?.attempt ?? null,
          nextDueAt: last !== null && intervalMs > 0 && intervals.has(id) ? isoOf(Date.parse(last.finishedAt) + intervalMs) : null,
        };
      });
    },
  };
  return registry;
}

declare module 'fastify' {
  interface FastifyInstance { hubJobs: JobRegistry }
}
