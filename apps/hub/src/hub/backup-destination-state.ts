import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';

/**
 * Per-destination backup v2 state (32-SS1, Milestone 847) in `dude.db` `meta` as `backup_dest_state:<id>`: what the owner status
 * route, the scheduler's due check and Milestone 850's overdue and failure notifications read. Kept outside `backup/` so the route
 * can read it (request handlers never import the backup modules). Only times, ids, sizes and short error codes go in here: no
 * path, no credential. The `backup_dest` meta prefix is scrubbed from every snapshot and cleared by a restore: the state belongs to
 * this machine's destinations, which a restored Hub does not have.
 */
export const BACKUP_DEST_STATE_PREFIX = 'backup_dest_state:';

export interface BackupDestinationState {
  lastAttemptAt?: string;
  lastOutcome?: 'success' | 'failure';
  lastSuccessAt?: string;
  lastBackupId?: string;
  lastErrorAt?: string;
  lastError?: string;
  lastVerifiedAt?: string;
  repoId?: string;
  /** Bytes of every committed object at the destination after the last successful run. */
  repoBytes?: number;
  /** Bytes this destination received in its last successful run (dedupe makes it far smaller than the backup). */
  lastWrittenBytes?: number;
}

const STRING_FIELDS = ['lastAttemptAt', 'lastSuccessAt', 'lastBackupId', 'lastErrorAt', 'lastError', 'lastVerifiedAt', 'repoId'] as const;
const NUMBER_FIELDS = ['repoBytes', 'lastWrittenBytes'] as const;

export function readDestinationState(db: Db, id: string): BackupDestinationState {
  const raw = getMeta(db, `${BACKUP_DEST_STATE_PREFIX}${id}`);
  if (raw === undefined) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const state: BackupDestinationState = {};
    for (const field of STRING_FIELDS) if (typeof parsed[field] === 'string') state[field] = parsed[field];
    for (const field of NUMBER_FIELDS) if (typeof parsed[field] === 'number' && Number.isSafeInteger(parsed[field])) state[field] = parsed[field];
    if (parsed['lastOutcome'] === 'success' || parsed['lastOutcome'] === 'failure') state.lastOutcome = parsed['lastOutcome'];
    return state;
  } catch {
    return {};
  }
}

/** Merges `patch` into the stored state (an `undefined` field is left unchanged). */
export function updateDestinationState(db: Db, id: string, patch: BackupDestinationState): BackupDestinationState {
  const next: BackupDestinationState = { ...readDestinationState(db, id) };
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  setMeta(db, `${BACKUP_DEST_STATE_PREFIX}${id}`, JSON.stringify(next));
  return next;
}

export function clearDestinationState(db: Db, id: string): void {
  db.prepare('DELETE FROM meta WHERE key = ?').run(`${BACKUP_DEST_STATE_PREFIX}${id}`);
}

/** After a failed run the next attempt waits the interval or this long, whichever is shorter (the 31G rule, per destination). */
export const BACKUP_RETRY_AFTER_FAILURE_MS = 6 * 3600_000;

/** When a scheduled run for this destination is next due (epoch ms); `now` when it never ran. */
export function nextDueAt(state: BackupDestinationState, intervalHours: number, now: number): number {
  const last = state.lastAttemptAt === undefined ? Number.NaN : Date.parse(state.lastAttemptAt);
  if (!Number.isFinite(last)) return now;
  const intervalMs = intervalHours * 3600_000;
  const waitMs = state.lastOutcome === 'failure' ? Math.min(intervalMs, BACKUP_RETRY_AFTER_FAILURE_MS) : intervalMs;
  return last + waitMs;
}
