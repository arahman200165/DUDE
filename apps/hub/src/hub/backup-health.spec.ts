import { afterEach, describe, expect, it } from 'vitest';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { audit } from '../security/audit.js';
import { tempDir } from '../server/test-helpers.js';
import { updateDestinationState } from './backup-destination-state.js';
import {
  BACKUP_OVERDUE_INTERVALS, RESTORE_DRILL_INTERVAL_MS, RESTORE_DRILL_RETRY_MS, destinationOverdue, evaluateBackupHealth, nextDrillDueAt, overdueAt, scheduleSetAt,
} from './backup-health.js';

const opened: HubDb[] = [];
afterEach(() => { for (const h of opened.splice(0)) { try { h.close(); } catch { /* closed */ } } });
function open(): HubDb {
  const paths = ensureLayout(tempDir('hub-health-'));
  const result = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (result.status !== 'ready') throw new Error('not ready');
  opened.push(result.hub);
  return result.hub;
}

const T0 = Date.UTC(2026, 9, 24, 10, 0, 0);
const HOUR = 3600_000;
const iso = (ms: number): string => new Date(ms).toISOString();
const row = (db: HubDb['db'], event: Parameters<typeof audit>[1]['event'], at: number, detail?: Record<string, unknown>): void => {
  audit(db, { event, outcome: 'success', actorKind: 'cli', ...(detail ? { detail } : {}), now: at });
};

describe('backup health', () => {
  it('is overdue at exactly twice the interval since the last success, not a millisecond before', () => {
    const { db } = open();
    updateDestinationState(db, 'd-1', { lastSuccessAt: iso(T0), lastOutcome: 'success' });
    const schedule = { intervalHours: 6 };
    const state = { lastSuccessAt: iso(T0) };
    expect(BACKUP_OVERDUE_INTERVALS).toBe(2);
    expect(overdueAt(T0, 6)).toBe(T0 + 12 * HOUR);
    expect(destinationOverdue(db, schedule, 'd-1', state, T0 + 12 * HOUR - 1)).toBeNull();
    expect(destinationOverdue(db, schedule, 'd-1', state, T0 + 12 * HOUR)).toEqual({ sinceMs: T0, ageMs: 12 * HOUR });
    expect(destinationOverdue(db, undefined, 'd-1', state, T0 + 100 * HOUR)).toBeNull();
  });

  it('counts a never-succeeded destination from the newest of the schedule being set and the destination being added, and reports nothing without a baseline', () => {
    const { db } = open();
    const schedule = { intervalHours: 1 };
    expect(destinationOverdue(db, schedule, 'd-1', {}, T0 + 99 * HOUR)).toBeNull();
    row(db, 'backup.scheduled', T0, { action: 'set', intervalHours: 1 });
    expect(destinationOverdue(db, schedule, 'd-1', {}, T0 + 2 * HOUR - 1)).toBeNull();
    expect(destinationOverdue(db, schedule, 'd-1', {}, T0 + 2 * HOUR)).toMatchObject({ sinceMs: T0 });
    row(db, 'backup.destination-added', T0 + HOUR, { destination: 'd-1', kind: 'local-folder', adopted: false });
    expect(destinationOverdue(db, schedule, 'd-1', {}, T0 + 2 * HOUR)).toBeNull();
    expect(destinationOverdue(db, schedule, 'd-1', {}, T0 + 3 * HOUR)).toMatchObject({ sinceMs: T0 + HOUR });
    // A success newer than both restarts the clock; an `off` row is not a baseline.
    row(db, 'backup.scheduled', T0 + 10 * HOUR, { action: 'off' });
    expect(scheduleSetAt(db)).toBe(T0);
    expect(destinationOverdue(db, schedule, 'd-1', { lastSuccessAt: iso(T0 + 20 * HOUR) }, T0 + 21 * HOUR)).toBeNull();
  });

  it('reads a 31G scheduled row (no action) as a schedule being set', () => {
    const { db } = open();
    row(db, 'backup.scheduled', T0, { folder: 'x', intervalHours: 6 });
    expect(scheduleSetAt(db)).toBe(T0);
  });

  it('evaluates each destination, a failed last run, a failed drill, and a schedule with no destination', () => {
    const { db } = open();
    row(db, 'backup.scheduled', T0, { action: 'set', intervalHours: 2 });
    updateDestinationState(db, 'd-1', { lastSuccessAt: iso(T0), lastOutcome: 'failure', lastError: 'ENOSPC', lastDrillOutcome: 'failure', lastDrillError: 'integrity-failed' });
    updateDestinationState(db, 'd-2', { lastSuccessAt: iso(T0 + 3 * HOUR), lastOutcome: 'success', lastDrillOutcome: 'success' });
    const input = { schedule: { intervalHours: 2 }, destinations: [{ id: 'd-1', label: 'One' }, { id: 'd-2', label: 'Two' }] };
    const health = evaluateBackupHealth(db, input, T0 + 4 * HOUR);
    expect(health).toEqual({
      destinations: [
        { id: 'd-1', label: 'One', overdue: { sinceMs: T0, ageMs: 4 * HOUR }, failed: { code: 'ENOSPC' }, drillFailed: { code: 'integrity-failed' } },
        { id: 'd-2', label: 'Two', overdue: null, failed: null, drillFailed: null },
      ],
      noDestination: null,
    });
    expect(JSON.stringify(health)).not.toMatch(/\\|\//);
    expect(evaluateBackupHealth(db, { schedule: { intervalHours: 2 }, destinations: [] }, T0 + 4 * HOUR - 1).noDestination).toBeNull();
    expect(evaluateBackupHealth(db, { schedule: { intervalHours: 2 }, destinations: [] }, T0 + 4 * HOUR).noDestination).toEqual({ sinceMs: T0, ageMs: 4 * HOUR });
    expect(evaluateBackupHealth(db, { schedule: undefined, destinations: [] }, T0 + 99 * HOUR)).toEqual({ destinations: [], noDestination: null });
  });

  it('schedules the drill: nothing before a successful backup, now when never drilled, a month after a pass, a day after a failure', () => {
    expect(nextDrillDueAt({}, T0)).toBeNull();
    expect(nextDrillDueAt({ lastSuccessAt: iso(T0) }, T0 + HOUR)).toBe(T0 + HOUR);
    expect(nextDrillDueAt({ lastSuccessAt: iso(T0), lastDrillAt: iso(T0), lastDrillOutcome: 'success' }, T0 + HOUR)).toBe(T0 + RESTORE_DRILL_INTERVAL_MS);
    expect(nextDrillDueAt({ lastSuccessAt: iso(T0), lastDrillAt: iso(T0), lastDrillOutcome: 'failure' }, T0 + HOUR)).toBe(T0 + RESTORE_DRILL_RETRY_MS);
    expect(RESTORE_DRILL_INTERVAL_MS).toBe(30 * 24 * HOUR);
    expect(RESTORE_DRILL_RETRY_MS).toBe(24 * HOUR);
  });
});
