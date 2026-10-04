import path from 'node:path';
import type { BackupDeps } from '@dude/hub-backup';
import type { Db } from '@dude/sqlite-store';
import type { HubPaths } from '../config/data-dir.js';
import type { HubConfig } from '../config/hub-config.js';
import { audit } from '../security/audit.js';
import type { CaKeyProtector } from '../tls/ca-key-protector.js';
import { getAuthorityEpoch } from '../hub/authority.js';
import { backupFailureCode, readBackupLast, writeBackupLast } from './backup-state.js';
import { createBackupFile } from './create-backup.js';
import { pruneBackups } from './retention.js';
import { loadScheduleKey } from './schedule-key.js';

export const BACKUP_SCHEDULER_CHECK_MS = 10 * 60_000;
/** After a failed run the next attempt waits the interval or this long, whichever is shorter. */
export const BACKUP_RETRY_AFTER_FAILURE_MS = 6 * 3600_000;

export type BackupAuditFn = (event: 'backup.created' | 'backup.failed' | 'backup.pruned', outcome: 'success' | 'failure', detail: Record<string, unknown>) => void;

export interface BackupSchedulerOptions {
  db: Db;
  paths: HubPaths;
  hubVersion: string;
  hubInstanceId: string;
  /** Reads the CURRENT config each tick, so `backup schedule set|off` applies without a restart. */
  readConfig: () => HubConfig;
  /** The protector the schedule key was saved with (only the elevated schedule commands and this job may use it). */
  protector: CaKeyProtector;
  deps: BackupDeps;
  now?: () => number;
  /** Starts a repeating timer (default `setInterval`, unref'd). */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  checkMs?: number;
  /** Default: writes the audit row as the system actor. */
  audit?: BackupAuditFn;
}

export type BackupRunOutcome = 'not-configured' | 'not-due' | 'busy' | 'created' | 'failed';

export interface BackupScheduler {
  start(): void;
  stop(): void;
  /** One check: runs a backup when a schedule is configured and due. Never throws. */
  runNow(): Promise<BackupRunOutcome>;
}

/**
 * Unattended backups (PD-074). A schedule keeps its folder, interval and retention in `hub.json`; the encryption key is the DPAPI-protected
 * derived key, never the passphrase. A run records `backup_last`, audits the outcome (file name, size and error code only) and prunes to the
 * retention count only after THIS run created and verified a backup. A failed run never prunes and never throws out of the timer.
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
  const writeAudit: BackupAuditFn = options.audit
    ?? ((event, outcome, detail) => audit(options.db, { event, outcome, actorKind: 'system', detail, now: now() }));
  let handle: unknown;
  let running = false;

  const safeAudit: BackupAuditFn = (event, outcome, detail) => {
    try { writeAudit(event, outcome, detail); } catch { /* an audit failure must not break the job */ }
  };
  const record = (entry: Parameters<typeof writeBackupLast>[1]): void => {
    try { writeBackupLast(options.db, entry); } catch { /* best effort */ }
  };
  const fail = (reason: string): BackupRunOutcome => {
    record({ at: new Date(now()).toISOString(), ok: false, error: reason });
    safeAudit('backup.failed', 'failure', { reason, trigger: 'schedule' });
    return 'failed';
  };

  async function runOnce(): Promise<BackupRunOutcome> {
    const schedule = options.readConfig().backup?.schedule;
    if (schedule === undefined) return 'not-configured';
    const last = readBackupLast(options.db);
    const lastAt = last === null ? Number.NaN : Date.parse(last.at);
    const intervalMs = schedule.intervalHours * 3600_000;
    const waitMs = last !== null && !last.ok ? Math.min(intervalMs, BACKUP_RETRY_AFTER_FAILURE_MS) : intervalMs;
    if (Number.isFinite(lastAt) && now() - lastAt < waitMs) return 'not-due';

    let derived;
    try {
      derived = loadScheduleKey(options.paths.configDir, options.protector);
    } catch {
      return fail('schedule-key-corrupt');
    }
    if (derived === null) return fail('schedule-key-missing');

    try {
      const created = await createBackupFile({
        db: options.db, paths: options.paths, hubVersion: options.hubVersion, hubInstanceId: options.hubInstanceId,
        authorityEpoch: getAuthorityEpoch(options.db), forTransfer: false, targetDir: schedule.folder,
        credential: { derived }, deps: options.deps, workDir: path.join(options.paths.backupsDir, '.tmp'),
      });
      const file = path.basename(created.file);
      record({ at: new Date(now()).toISOString(), ok: true, file, size: created.size });
      safeAudit('backup.created', 'success', { file, size: created.size, trigger: 'schedule' });
      try {
        const deleted = pruneBackups(schedule.folder, schedule.retention);
        if (deleted.length > 0) safeAudit('backup.pruned', 'success', { count: deleted.length });
      } catch {
        safeAudit('backup.failed', 'failure', { reason: 'prune-failed', trigger: 'schedule' });
      }
      return 'created';
    } catch (error) {
      return fail(backupFailureCode(error));
    }
  }

  async function runNow(): Promise<BackupRunOutcome> {
    if (running) return 'busy';
    running = true;
    try {
      return await runOnce();
    } catch {
      return 'failed';
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (handle !== undefined) return;
      handle = setTimer(() => { void runNow(); }, checkMs);
    },
    stop() {
      if (handle === undefined) return;
      clearTimer(handle);
      handle = undefined;
    },
    runNow,
  };
}
