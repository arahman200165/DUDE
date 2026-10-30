import type { Db } from '@dude/sqlite-store';
import type { HubPowerSetting, HubPowerStatus } from '@dude/contracts/hub';
import type { JobHandle, JobRunReport } from '../jobs/job-status.js';
import { audit } from '../security/audit.js';
import { readPowerState, writePowerState } from './policy-state.js';
import type { PowerPolicyState, PowerPreviousValues } from './policy-state.js';
import { changeCommand, readPowerPolicy } from './powercfg.js';
import type { PowerCommand, PowerReading, PowerRunner } from './powercfg.js';

/** The hourly re-check (Milestone 851): cheap (two `powercfg` reads) and the only thing between a changed power plan and the owner knowing. */
export const POWER_CHECK_MS = 3600_000;

export class PowerChangeError extends Error {
  constructor(readonly reason: 'powercfg-failed' | 'not-verified' | 'unavailable', message: string) {
    super(message);
  }
}

/** What an apply or a revert would run and what it expects to find afterwards. */
export interface PowerPlan {
  action: 'apply' | 'revert';
  commands: PowerCommand[];
  /** The AC timeouts (minutes) as observed when the plan was made. */
  before: { sleepAcMinutes: number | null; hibernateAcMinutes: number | null };
  /** The AC timeouts the plan expects to read back. */
  after: { sleepAcMinutes: number | null; hibernateAcMinutes: number | null };
  /** The values an apply replaces (what a revert would restore), merged with any earlier recorded ones. */
  previous: PowerPreviousValues;
}

export interface PowerCheckResult { reading: PowerReading; status: HubPowerStatus; newlyRegressed: boolean }

export interface PowerPolicyOptions {
  db: Db;
  now: () => number;
  platform: NodeJS.Platform;
  runner: PowerRunner;
  /** True while something depends on the machine staying awake (a managed tunnel or a backup schedule is configured). */
  needed?: () => boolean;
  job?: JobHandle;
  checkMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface PowerPolicy {
  /** A live read; writes nothing. */
  read(): Promise<PowerReading>;
  /** The last status a check or a change produced (undefined until the first one); the provisioning component reads it without spawning anything. */
  lastStatus(): HubPowerStatus | undefined;
  /** The stored state (previous values, applied, opted out, regression). */
  state(): PowerPolicyState;
  /** A live read merged with the stored state. */
  status(): Promise<HubPowerStatus>;
  /** Reads, records, and reports (audit `power.regressed`, once per episode) a regression. */
  check(): Promise<PowerCheckResult>;
  planApply(reading: PowerReading): PowerPlan;
  planRevert(reading: PowerReading): PowerPlan | null;
  /** Runs an apply plan (the caller already consumed the confirmation): records the previous values first, runs, re-reads, verifies, audits `power.changed`. */
  apply(plan: PowerPlan): Promise<PowerReading>;
  /** Runs a revert plan the same way and audits `power.reverted`. */
  revert(plan: PowerPlan): Promise<PowerReading>;
  start(): void;
  stop(): void;
  /** One check, tracked as the `power-policy` job; the timer runs it hourly and the Hub runs it once at start. Null when another run is in progress or the read failed. */
  runOnce(): Promise<PowerCheckResult | null>;
}

const isoOf = (ms: number): string => new Date(ms).toISOString();

const SETTINGS: readonly HubPowerSetting[] = ['standby', 'hibernate'];
const minutesOf = (reading: { sleepAcMinutes: number | null; hibernateAcMinutes: number | null }, setting: HubPowerSetting): number | null =>
  setting === 'standby' ? reading.sleepAcMinutes : reading.hibernateAcMinutes;

/** The previous values to record for an apply: what is observed now, except a setting this feature already set to 0 keeps its earlier recorded value (a re-run after a partial failure must not lose the original). */
export function mergePrevious(existing: PowerPreviousValues | undefined, observed: { sleepAcMinutes: number | null; hibernateAcMinutes: number | null }): PowerPreviousValues {
  const merged: PowerPreviousValues = { ...(existing ?? {}) };
  for (const setting of SETTINGS) {
    const minutes = minutesOf(observed, setting);
    if (minutes !== null && minutes > 0) merged[setting] = minutes;
  }
  return merged;
}

export function createPowerPolicy(options: PowerPolicyOptions): PowerPolicy {
  const { db, now, platform, runner } = options;
  const checkMs = options.checkMs ?? POWER_CHECK_MS;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number): unknown => {
    const handle = setInterval(fn, ms);
    handle.unref();
    return handle;
  });
  const clearTimer = options.clearTimer ?? ((handle: unknown): void => clearInterval(handle as NodeJS.Timeout));
  let timer: unknown;
  let running = false;
  let last: HubPowerStatus | undefined;

  const read = (): Promise<PowerReading> => readPowerPolicy(runner, platform);

  const statusOf = (reading: PowerReading, state: PowerPolicyState): HubPowerStatus => ({
    verdict: reading.verdict,
    checkedAt: isoOf(now()),
    sleepAcMinutes: reading.sleepAcMinutes,
    hibernateAcMinutes: reading.hibernateAcMinutes,
    sleepStates: reading.sleepStates,
    applied: state.appliedAt !== undefined,
    regressed: state.regressedAt !== undefined && reading.verdict === 'needs-change',
    optedOut: state.optedOut === true,
  });

  const remember = (reading: PowerReading, state: PowerPolicyState): HubPowerStatus => {
    last = statusOf(reading, state);
    return last;
  };

  const check = async (): Promise<PowerCheckResult> => {
    const reading = await read();
    const state = readPowerState(db);
    const at = isoOf(now());
    const next: PowerPolicyState = { ...state, lastCheckedAt: at };
    let newlyRegressed = false;
    if (reading.verdict === 'ok') {
      next.lastOkAt = at;
      delete next.regressedAt;
      delete next.regressedReason;
    } else if (reading.verdict === 'needs-change' && state.optedOut !== true && state.regressedAt === undefined) {
      const wasInPlace = state.lastOkAt !== undefined || state.appliedAt !== undefined;
      const reason = wasInPlace ? 'regressed' : (options.needed?.() ?? false) ? 'not-applied' : null;
      if (reason !== null) {
        next.regressedAt = at;
        next.regressedReason = reason;
        newlyRegressed = true;
      }
    }
    writePowerState(db, next);
    if (newlyRegressed) {
      // The audit row is the single source of the owner notification (notifications/producers.ts); a replayed check inserts nothing (the episode is stored first).
      audit(db, {
        event: 'power.regressed', outcome: 'failure', actorKind: 'system', now: now(),
        detail: { reason: next.regressedReason, sleepAcMinutes: reading.sleepAcMinutes, hibernateAcMinutes: reading.hibernateAcMinutes },
      });
    }
    return { reading, status: remember(reading, next), newlyRegressed };
  };

  const planApply = (reading: PowerReading): PowerPlan => {
    const commands: PowerCommand[] = [];
    const after = { sleepAcMinutes: reading.sleepAcMinutes, hibernateAcMinutes: reading.hibernateAcMinutes };
    for (const setting of SETTINGS) {
      const minutes = minutesOf(reading, setting);
      if (minutes !== null && minutes > 0) {
        commands.push(changeCommand(setting, 0));
        if (setting === 'standby') after.sleepAcMinutes = 0;
        else after.hibernateAcMinutes = 0;
      }
    }
    return {
      action: 'apply', commands, before: { sleepAcMinutes: reading.sleepAcMinutes, hibernateAcMinutes: reading.hibernateAcMinutes }, after,
      previous: mergePrevious(readPowerState(db).previous, reading),
    };
  };

  const planRevert = (reading: PowerReading): PowerPlan | null => {
    const previous = readPowerState(db).previous;
    if (previous === undefined) return null;
    const commands: PowerCommand[] = [];
    const after = { sleepAcMinutes: reading.sleepAcMinutes, hibernateAcMinutes: reading.hibernateAcMinutes };
    for (const setting of SETTINGS) {
      const minutes = previous[setting];
      if (minutes === undefined) continue;
      commands.push(changeCommand(setting, minutes));
      if (setting === 'standby') after.sleepAcMinutes = minutes;
      else after.hibernateAcMinutes = minutes;
    }
    return { action: 'revert', commands, before: { sleepAcMinutes: reading.sleepAcMinutes, hibernateAcMinutes: reading.hibernateAcMinutes }, after, previous };
  };

  const execute = async (plan: PowerPlan): Promise<PowerReading> => {
    for (const command of plan.commands) {
      let code: number;
      try {
        code = (await runner(command.args)).code;
      } catch {
        throw new PowerChangeError('unavailable', 'powercfg could not be started.');
      }
      // The message never carries powercfg's output (it is localized and may echo a plan name).
      if (code !== 0) throw new PowerChangeError('powercfg-failed', `powercfg failed while setting ${command.setting} (exit ${code}). Run this from an elevated terminal on the Hub computer.`);
    }
    return read();
  };

  const verified = (plan: PowerPlan, reading: PowerReading): boolean => {
    if (reading.verdict === 'unsupported' || reading.verdict === 'unknown') return false;
    return SETTINGS.every((setting) => {
      const expected = minutesOf(plan.after, setting);
      return expected === null || minutesOf(reading, setting) === expected;
    });
  };

  const detailOf = (plan: PowerPlan, reading: PowerReading): Record<string, unknown> => ({
    commands: plan.commands.map((c) => c.display),
    sleepAcBefore: plan.before.sleepAcMinutes, hibernateAcBefore: plan.before.hibernateAcMinutes,
    sleepAcAfter: reading.sleepAcMinutes, hibernateAcAfter: reading.hibernateAcMinutes,
  });

  const apply = async (plan: PowerPlan): Promise<PowerReading> => {
    // The replaced values are stored BEFORE the first command runs, so a failure part-way through can still be reverted.
    const started: PowerPolicyState = { ...readPowerState(db), previous: plan.previous };
    delete started.optedOut;
    delete started.revertedAt;
    writePowerState(db, started);
    let reading: PowerReading;
    try {
      reading = await execute(plan);
    } catch (error) {
      audit(db, { event: 'power.changed', outcome: 'failure', actorKind: 'cli', now: now(), detail: { reason: error instanceof PowerChangeError ? error.reason : 'failed', commands: plan.commands.map((c) => c.display) } });
      throw error;
    }
    if (reading.verdict !== 'ok' || !verified(plan, reading)) {
      audit(db, { event: 'power.changed', outcome: 'failure', actorKind: 'cli', now: now(), detail: { reason: 'not-verified', ...detailOf(plan, reading) } });
      remember(reading, readPowerState(db));
      throw new PowerChangeError('not-verified', 'powercfg ran but the settings were not found changed afterwards (a group policy may be enforcing them).');
    }
    const at = isoOf(now());
    const next: PowerPolicyState = { ...readPowerState(db), appliedAt: at, lastOkAt: at, lastCheckedAt: at };
    delete next.regressedAt;
    delete next.regressedReason;
    writePowerState(db, next);
    audit(db, { event: 'power.changed', outcome: 'success', actorKind: 'cli', now: now(), detail: detailOf(plan, reading) });
    remember(reading, next);
    return reading;
  };

  const revert = async (plan: PowerPlan): Promise<PowerReading> => {
    let reading: PowerReading;
    try {
      reading = await execute(plan);
    } catch (error) {
      audit(db, { event: 'power.reverted', outcome: 'failure', actorKind: 'cli', now: now(), detail: { reason: error instanceof PowerChangeError ? error.reason : 'failed', commands: plan.commands.map((c) => c.display) } });
      throw error;
    }
    if (!verified(plan, reading)) {
      audit(db, { event: 'power.reverted', outcome: 'failure', actorKind: 'cli', now: now(), detail: { reason: 'not-verified', ...detailOf(plan, reading) } });
      remember(reading, readPowerState(db));
      throw new PowerChangeError('not-verified', 'powercfg ran but the settings were not found restored afterwards.');
    }
    const at = isoOf(now());
    // A deliberate revert is not a regression: no notice is raised until the owner applies the policy again.
    const next: PowerPolicyState = { optedOut: true, revertedAt: at, lastCheckedAt: at };
    writePowerState(db, next);
    audit(db, { event: 'power.reverted', outcome: 'success', actorKind: 'cli', now: now(), detail: detailOf(plan, reading) });
    remember(reading, next);
    return reading;
  };

  const runNow = async (): Promise<PowerCheckResult | null> => {
    if (running) return null;
    running = true;
    try {
      return await check();
    } catch {
      return null;
    } finally {
      running = false;
    }
  };

  const classify = (result: PowerCheckResult | null): JobRunReport => {
    if (result === null) return { outcome: 'skipped', summary: 'The power policy check could not run.' };
    switch (result.reading.verdict) {
      case 'unsupported': return { outcome: 'skipped', summary: 'The power policy is not checked on this deployment.' };
      case 'unknown': return { outcome: 'success', summary: 'The power settings could not be read.' };
      case 'ok': return { outcome: 'success', summary: 'Sleep and hibernate are off on AC power.' };
      case 'needs-change':
        return result.status.regressed
          ? { outcome: 'failed', summary: 'The Hub computer can sleep or hibernate on AC power; run "dude-hub power apply".' }
          : { outcome: 'success', summary: 'The Hub computer can sleep or hibernate on AC power.' };
    }
  };

  return {
    read,
    lastStatus: () => last,
    state: () => readPowerState(db),
    status: async () => {
      const reading = await read();
      return statusOf(reading, readPowerState(db));
    },
    check,
    planApply,
    planRevert,
    apply,
    revert,
    runOnce: () => (options.job ? options.job.track(runNow, classify) : runNow()),
    start() {
      if (timer !== undefined) return;
      timer = setTimer(() => { void (options.job ? options.job.track(runNow, classify) : runNow()); }, checkMs);
    },
    stop() {
      if (timer !== undefined) { clearTimer(timer); timer = undefined; }
    },
  };
}
