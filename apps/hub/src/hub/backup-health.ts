import type { Db } from '@dude/sqlite-store';
import { readDestinationState } from './backup-destination-state.js';
import type { BackupDestinationState } from './backup-destination-state.js';

/**
 * Backup health (32-SS1, Milestone 850, PD-150): when a destination's backups are overdue, when its last run failed, when its last
 * restore drill failed, and when the next drill is due. Read-only over `dude.db` (the per-destination state and the audit log), kept
 * outside `backup/` so the owner status route, the notification producers and the admin status read it without importing the
 * backup engine. Nothing here returns a path or a credential: ids, labels, times and short codes only.
 */
const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

/** A destination's backup is overdue once its last success (or, never having succeeded, its schedule) is this many intervals old. */
export const BACKUP_OVERDUE_INTERVALS = 2;
/** Each destination's newest verified backup is restored into a scratch directory this often ("monthly", PD-150). */
export const RESTORE_DRILL_INTERVAL_MS = 30 * DAY_MS;
/** After a failed drill the next attempt waits this long instead (a transient outage clears within a day). */
export const RESTORE_DRILL_RETRY_MS = DAY_MS;

export interface BackupHealthInput {
  /** The configured schedule (`hub.json` `backup.schedule`); overdue applies only while one is set. */
  schedule?: { intervalHours: number } | undefined;
  /** The configured destinations (id and owner label only). */
  destinations: ReadonlyArray<{ id: string; label: string }>;
}

export interface DestinationHealth {
  id: string;
  label: string;
  /** Overdue: no success for `BACKUP_OVERDUE_INTERVALS` intervals since `sinceMs` (the newest of the last success, the schedule being set and the destination being added). */
  overdue: { sinceMs: number; ageMs: number } | null;
  /** The last run (scheduled or manual) failed, with its short code. */
  failed: { code: string } | null;
  /** The last restore drill that reached a verdict failed, with its short code. */
  drillFailed: { code: string } | null;
}

export interface BackupHealth {
  destinations: DestinationHealth[];
  /** A schedule is set but no destination exists (an upgraded 31G schedule, or the last destination removed): overdue like a destination. */
  noDestination: { sinceMs: number; ageMs: number } | null;
}

/** The instant a backup last proven at `sinceMs` becomes overdue: exactly twice the interval later counts as overdue. */
export const overdueAt = (sinceMs: number, intervalHours: number): number => sinceMs + BACKUP_OVERDUE_INTERVALS * intervalHours * HOUR_MS;

const parse = (iso: string | undefined | null): number | null => {
  if (typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

/** When the schedule was last set (a `backup.scheduled` row that is not `action: off`; 31G rows carry no action). */
export function scheduleSetAt(db: Db): number | null {
  const row = db.prepare(
    "SELECT at FROM audit_events WHERE event = 'backup.scheduled' AND COALESCE(json_extract(detail_json, '$.action'), 'set') = 'set' ORDER BY seq DESC LIMIT 1",
  ).get() as { at: string } | undefined;
  return parse(row?.at);
}

/** When this destination was last added (or adopted). */
export function destinationAddedAt(db: Db, destinationId: string): number | null {
  const row = db.prepare(
    "SELECT at FROM audit_events WHERE event = 'backup.destination-added' AND json_extract(detail_json, '$.destination') = ? ORDER BY seq DESC LIMIT 1",
  ).get(destinationId) as { at: string } | undefined;
  return parse(row?.at);
}

const newest = (...values: Array<number | null>): number | null => {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : Math.max(...present);
};

/**
 * Whether one destination is overdue. The clock starts at the newest of its last success, the schedule being set and the destination
 * being added, so re-enabling a schedule or adding a destination never reports an instantly overdue backup, and a destination that
 * never succeeded counts from the schedule (or from when it was added, if later). Without any baseline nothing is reported.
 */
export function destinationOverdue(db: Db, schedule: { intervalHours: number } | undefined, destinationId: string, state: BackupDestinationState, now: number, setAt: number | null = scheduleSetAt(db)): { sinceMs: number; ageMs: number } | null {
  if (schedule === undefined) return null;
  const sinceMs = newest(parse(state.lastSuccessAt), setAt, destinationAddedAt(db, destinationId));
  if (sinceMs === null || now < overdueAt(sinceMs, schedule.intervalHours)) return null;
  return { sinceMs, ageMs: now - sinceMs };
}

export function evaluateBackupHealth(db: Db, input: BackupHealthInput, now: number): BackupHealth {
  const setAt = input.schedule === undefined ? null : scheduleSetAt(db);
  const destinations = input.destinations.map((d): DestinationHealth => {
    const state = readDestinationState(db, d.id);
    return {
      id: d.id,
      label: d.label,
      overdue: destinationOverdue(db, input.schedule, d.id, state, now, setAt),
      failed: state.lastOutcome === 'failure' ? { code: state.lastError ?? 'unknown' } : null,
      drillFailed: state.lastDrillOutcome === 'failure' ? { code: state.lastDrillError ?? 'unknown' } : null,
    };
  });
  let noDestination: BackupHealth['noDestination'] = null;
  if (input.schedule !== undefined && input.destinations.length === 0 && setAt !== null && now >= overdueAt(setAt, input.schedule.intervalHours)) {
    noDestination = { sinceMs: setAt, ageMs: now - setAt };
  }
  return { destinations, noDestination };
}

/**
 * When the next restore drill of a destination is due (epoch ms), or null when there is nothing to drill yet (no verified backup
 * recorded). Never drilled: now. After a passed drill: `RESTORE_DRILL_INTERVAL_MS`; after a failed one: `RESTORE_DRILL_RETRY_MS`.
 */
export function nextDrillDueAt(state: BackupDestinationState, now: number): number | null {
  if (state.lastSuccessAt === undefined) return null;
  const last = parse(state.lastDrillAt);
  if (last === null) return now;
  return last + (state.lastDrillOutcome === 'failure' ? RESTORE_DRILL_RETRY_MS : RESTORE_DRILL_INTERVAL_MS);
}
