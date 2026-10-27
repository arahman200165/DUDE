import type { BackupDeps } from '@dude/hub-backup';
import type { Db } from '@dude/sqlite-store';
import type { HubPaths } from '../config/data-dir.js';
import type { HubBackupDestinationConfig, HubConfig } from '../config/hub-config.js';
import { nextDueAt, readDestinationState, updateDestinationState } from '../hub/backup-destination-state.js';
import type { JobHandle, JobRunReport } from '../jobs/job-status.js';
import { audit } from '../security/audit.js';
import { writeBackupLast } from './backup-state.js';
import { openBackupDestination } from './destinations/index.js';
import type { BackupDestination } from './destinations/index.js';
import type { MasterKeyStore } from './master-key.js';
import { BackupRunError, backupRunFailureCode, runBackupV2 } from './run-backup-v2.js';
import type { BackupV2AuditFn, RunBackupV2Options, RunBackupV2Result } from './run-backup-v2.js';

export const BACKUP_SCHEDULER_CHECK_MS = 10 * 60_000;
export { BACKUP_RETRY_AFTER_FAILURE_MS } from '../hub/backup-destination-state.js';

export interface BackupSchedulerOptions {
  db: Db;
  paths: HubPaths;
  hubVersion: string;
  hubInstanceId: string;
  /** Reads the CURRENT config each tick, so `backup schedule set|off` and destination changes apply without a restart. */
  readConfig: () => HubConfig;
  /** The backup v2 master key (secret store); only the backup admin methods and this job read it. */
  masterKeys: MasterKeyStore;
  deps: BackupDeps;
  now?: () => number;
  /** Starts a repeating timer (default `setInterval`, unref'd). */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  checkMs?: number;
  /** Default: writes the audit row as the system actor. */
  audit?: BackupV2AuditFn;
  /** Reports each timer check to the job status registry (PD-112); optional and observation-only. */
  job?: JobHandle;
  /** Called after each check that found a schedule, with its interval (the overdue notification, PD-109); optional and observation-only. */
  onCheck?: (schedule: { intervalHours: number }) => void;
  /** Writes in-memory collaborative state before the snapshot (PD-105). */
  beforeSnapshot?: () => void;
  /** The Hub's live `savesphere.db` connection when it has one. */
  saveSphereDb?: () => Db | undefined;
  /** Test seams. */
  openDestination?: (definition: HubBackupDestinationConfig) => BackupDestination;
  runBackup?: (options: RunBackupV2Options) => Promise<RunBackupV2Result>;
}

export type BackupRunOutcome = 'not-configured' | 'not-due' | 'busy' | 'created' | 'failed';

const RUN_REPORTS: Record<BackupRunOutcome, JobRunReport> = {
  'not-configured': { outcome: 'skipped', summary: 'No backup schedule is configured.' },
  'not-due': { outcome: 'skipped', summary: 'The next scheduled backup is not due yet.' },
  busy: { outcome: 'skipped', summary: 'A backup was already running.' },
  created: { outcome: 'success', summary: 'Scheduled backups were created and verified.' },
  failed: { outcome: 'failed', summary: 'A scheduled backup failed; see the backup status.' },
};

export interface BackupScheduler {
  start(): void;
  stop(): void;
  /** One check: runs a backup into every destination that is due. Never throws. */
  runNow(): Promise<BackupRunOutcome>;
}

/**
 * Unattended backups, migrated to backup v2 at 32-SS1 (Milestone 847). A schedule is only an interval (`hub.json`
 * `backup.schedule.intervalHours`); every configured destination is backed up in turn by the v2 engine with the master key from the
 * secret store (never the passphrase), each destination due on its own (`nextDueAt`: the interval after its last attempt, or the
 * shorter retry back-off after a failure) and isolated from the others (a failure is recorded for that destination only). The
 * engine records the per-destination state that Milestone 850's overdue and failure notifications read, and `backup_last` keeps
 * the latest overall outcome for the 31G read model. A run never prunes: retention is the two-step `backup prune`. Never throws
 * out of its timer.
 */
export function createBackupScheduler(options: BackupSchedulerOptions): BackupScheduler {
  const now = options.now ?? Date.now;
  const checkMs = options.checkMs ?? BACKUP_SCHEDULER_CHECK_MS;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number): unknown => {
    const handle = setInterval(fn, ms);
    handle.unref();
    return handle;
  });
  const clearTimer = options.clearTimer ?? ((handle: unknown): void => clearInterval(handle as NodeJS.Timeout));
  const writeAudit: BackupV2AuditFn = options.audit
    ?? ((event, outcome, detail) => audit(options.db, { event, outcome, actorKind: 'system', detail, now: now() }));
  const safeAudit: BackupV2AuditFn = (event, outcome, detail) => { try { writeAudit(event, outcome, detail); } catch { /* an audit failure must not break the job */ } };
  const open = options.openDestination ?? ((definition: HubBackupDestinationConfig) => openBackupDestination(definition, options.paths));
  const run = options.runBackup ?? runBackupV2;
  let handle: unknown;
  let running = false;

  const record = (entry: Parameters<typeof writeBackupLast>[1]): void => {
    try { writeBackupLast(options.db, entry); } catch { /* best effort */ }
  };
  /** A failure recorded for a destination the engine never reached (no key, a bad definition). */
  const failDestination = (id: string, reason: string): void => {
    try { updateDestinationState(options.db, id, { lastAttemptAt: new Date(now()).toISOString(), lastOutcome: 'failure', lastErrorAt: new Date(now()).toISOString(), lastError: reason }); } catch { /* best effort */ }
    safeAudit('backup.v2-failed', 'failure', { destination: id, reason, trigger: 'schedule' });
  };

  async function runOnce(): Promise<BackupRunOutcome> {
    const config = options.readConfig();
    const schedule = config.backup?.schedule;
    if (schedule === undefined) return 'not-configured';
    const destinations = config.backup?.destinations ?? [];
    const at = now();
    if (destinations.length === 0) {
      // A 31G schedule that was never set again (or a schedule whose last destination was removed): nothing to back up into.
      record({ at: new Date(at).toISOString(), ok: false, error: 'no-destination' });
      safeAudit('backup.v2-failed', 'failure', { reason: 'no-destination', trigger: 'schedule' });
      return 'failed';
    }
    const due = destinations.filter((d) => nextDueAt(readDestinationState(options.db, d.id), schedule.intervalHours, at) <= at);
    if (due.length === 0) return 'not-due';

    let masterKey: Uint8Array | null;
    try {
      masterKey = options.masterKeys.load();
    } catch {
      for (const d of due) failDestination(d.id, 'master-key-unreadable');
      record({ at: new Date(at).toISOString(), ok: false, error: 'master-key-unreadable' });
      return 'failed';
    }
    if (masterKey === null) {
      for (const d of due) failDestination(d.id, 'master-key-missing');
      record({ at: new Date(at).toISOString(), ok: false, error: 'master-key-missing' });
      return 'failed';
    }

    let failures = 0;
    let busy = 0;
    let firstError: string | undefined;
    let lastSuccess: RunBackupV2Result | undefined;
    try {
      for (const definition of due) {
        let destination: BackupDestination;
        try {
          destination = open(definition);
        } catch (error) {
          failures += 1;
          firstError ??= backupRunFailureCode(error);
          failDestination(definition.id, backupRunFailureCode(error));
          continue;
        }
        try {
          const saveSphereDb = options.saveSphereDb?.();
          lastSuccess = await run({
            db: options.db, paths: options.paths, hubVersion: options.hubVersion, hubInstanceId: options.hubInstanceId, destination, masterKey,
            deps: options.deps, now, trigger: 'schedule', audit: safeAudit,
            ...(saveSphereDb !== undefined ? { saveSphereDb } : {}),
            ...(options.beforeSnapshot ? { beforeSnapshot: options.beforeSnapshot } : {}),
          });
        } catch (error) {
          if (error instanceof BackupRunError && error.code === 'busy') { busy += 1; continue; }
          failures += 1;
          firstError ??= backupRunFailureCode(error);
        }
      }
    } finally {
      masterKey.fill(0);
    }
    if (failures === 0 && lastSuccess === undefined) return busy > 0 ? 'busy' : 'not-due';
    const doneAt = new Date(now()).toISOString();
    if (failures > 0) {
      record({ at: doneAt, ok: false, error: firstError ?? 'create-failed' });
      return 'failed';
    }
    record({ at: doneAt, ok: true, ...(lastSuccess ? { file: lastSuccess.backupId, size: lastSuccess.bytesWritten } : {}) });
    return 'created';
  }

  async function runNow(): Promise<BackupRunOutcome> {
    if (running) return 'busy';
    running = true;
    try {
      const outcome = await runOnce();
      try {
        const schedule = outcome === 'not-configured' ? undefined : options.readConfig().backup?.schedule;
        if (schedule !== undefined) options.onCheck?.({ intervalHours: schedule.intervalHours });
      } catch { /* observation only */ }
      return outcome;
    } catch {
      return 'failed';
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (handle !== undefined) return;
      handle = setTimer(() => { void (options.job ? options.job.track(runNow, (outcome) => RUN_REPORTS[outcome]) : runNow()); }, checkMs);
    },
    stop() {
      if (handle === undefined) return;
      clearTimer(handle);
      handle = undefined;
    },
    runNow,
  };
}
