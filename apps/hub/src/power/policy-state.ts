import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { POWER_MINUTES_MAX } from './powercfg.js';

/**
 * What the Hub remembers about the machine's power policy (32-SS1, Milestone 851) in `dude.db` `meta` as `power_policy_state`: the
 * values `power apply` replaced (so `power revert` can restore them), whether the policy was ever seen in place, and whether a
 * regression was already reported. Minutes, times and fixed words only: no path, no command output. The `power_policy` meta prefix is
 * scrubbed from every snapshot and cleared by a restore: the settings belong to THIS machine's power plan, which a restored Hub (a
 * different computer) does not share.
 */
export const POWER_POLICY_META_PREFIX = 'power_policy';
const STATE_KEY = 'power_policy_state';

export interface PowerPreviousValues { standby?: number; hibernate?: number }

export interface PowerPolicyState {
  /** The AC timeouts (minutes) `power apply` replaced; present from the moment an apply starts until a revert completes. */
  previous?: PowerPreviousValues;
  /** When an apply was verified (the policy was in place right after it). */
  appliedAt?: string;
  /** When the owner reverted: no regression notice is raised until they apply again. */
  optedOut?: boolean;
  revertedAt?: string;
  /** The last check that found the policy in place. */
  lastOkAt?: string;
  lastCheckedAt?: string;
  /** The open regression episode: set by the first check that reports it, cleared by the next check that finds the policy ok. */
  regressedAt?: string;
  regressedReason?: 'regressed' | 'not-applied';
}

const TIME_FIELDS = ['appliedAt', 'revertedAt', 'lastOkAt', 'lastCheckedAt', 'regressedAt'] as const;

const minutes = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= POWER_MINUTES_MAX ? value : undefined;

export function readPowerState(db: Db): PowerPolicyState {
  const raw = getMeta(db, STATE_KEY);
  if (raw === undefined) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const state: PowerPolicyState = {};
    for (const field of TIME_FIELDS) if (typeof parsed[field] === 'string') state[field] = parsed[field];
    if (parsed['optedOut'] === true) state.optedOut = true;
    if (parsed['regressedReason'] === 'regressed' || parsed['regressedReason'] === 'not-applied') state.regressedReason = parsed['regressedReason'];
    const previous = parsed['previous'];
    if (typeof previous === 'object' && previous !== null && !Array.isArray(previous)) {
      const values: PowerPreviousValues = {};
      const standby = minutes((previous as Record<string, unknown>)['standby']);
      const hibernate = minutes((previous as Record<string, unknown>)['hibernate']);
      if (standby !== undefined) values.standby = standby;
      if (hibernate !== undefined) values.hibernate = hibernate;
      if (Object.keys(values).length > 0) state.previous = values;
    }
    return state;
  } catch {
    return {};
  }
}

/** Replaces the stored state with `next` (callers pass the whole object, so a cleared field is simply absent). */
export function writePowerState(db: Db, next: PowerPolicyState): void {
  setMeta(db, STATE_KEY, JSON.stringify(next));
}
