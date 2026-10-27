import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import type { HubProvisioningOverall } from '@dude/contracts/hub';
import type { ComponentOutcome, SecretPresence, StoreHandle } from './types.js';

/** `savesphere.db` `meta` key holding the last provisioning run. Kept by backups (`meta` is a kept table), which is how a restored Hub knows it must be provisioned again. */
export const PROVISIONING_LAST_RUN_META = 'provisioning_last_run';

export interface LastRun {
  /** ISO-8601 instant. */
  at: string;
  outcome: 'ok' | 'attention';
  /** The Hub identity that ran it; a restore creates a new identity, so a difference means "restored or moved". */
  hubInstanceId?: string;
}

export function readLastRun(db: Db): LastRun | null {
  const raw = getMeta(db, PROVISIONING_LAST_RUN_META);
  if (raw === undefined) return null;
  try {
    const value = JSON.parse(raw) as Partial<LastRun>;
    if (typeof value.at !== 'string' || (value.outcome !== 'ok' && value.outcome !== 'attention')) return null;
    return { at: value.at, outcome: value.outcome, ...(typeof value.hubInstanceId === 'string' ? { hubInstanceId: value.hubInstanceId } : {}) };
  } catch {
    return null;
  }
}

export function writeLastRun(db: Db, run: LastRun): void {
  setMeta(db, PROVISIONING_LAST_RUN_META, JSON.stringify(run));
}

export interface DeriveInput {
  storeState: StoreHandle['state'];
  lastRun: LastRun | null;
  /** The running Hub's identity, when the caller knows it. */
  hubInstanceId?: string | undefined;
  components: ReadonlyArray<{ state: ComponentOutcome['state']; core: boolean }>;
  secrets: readonly SecretPresence[];
}

/**
 * The one derivation behind `overall`. No store: `not-provisioned`. A store that will not open: `needs-attention`. Otherwise
 * `needs-provisioning` when a run is required: none was ever recorded, the recorded run belongs to another Hub identity (a restore
 * or a moved data directory), a required component is not configured (its directory is gone) or a secret the Hub expects is missing
 * (the machine-bound secrets never travel in a backup). Then the worst component state decides; `unavailable` is by design and
 * never lowers the result.
 */
export function deriveOverall(input: DeriveInput): HubProvisioningOverall {
  if (input.storeState === 'absent') return 'not-provisioned';
  if (input.storeState !== 'ready') return 'needs-attention';
  const otherIdentity = input.hubInstanceId !== undefined && input.lastRun?.hubInstanceId !== undefined && input.lastRun.hubInstanceId !== input.hubInstanceId;
  const missingCore = input.components.some((c) => c.core && c.state === 'not-configured');
  if (input.lastRun === null || otherIdentity || missingCore || input.secrets.some((s) => s.needsReentry)) return 'needs-provisioning';
  if (input.components.some((c) => c.state === 'needs-attention')) return 'needs-attention';
  if (input.components.some((c) => c.state === 'degraded')) return 'degraded';
  return 'ready';
}
