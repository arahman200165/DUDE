import type { Db } from '@dude/sqlite-store';
import type { HubNotification } from '@dude/contracts/hub';
import type { JobFinish, JobRegistry } from '../jobs/job-status.js';
import { onAudit } from '../security/audit.js';
import type { AuditNotice } from '../security/audit.js';
import { SECURITY_ALERT_EVENTS, deviceName, summarize } from '../server/routes/security-alerts.js';
import { insertNotification } from './store.js';
import type { NewNotification } from './store.js';

const ALERT_EVENTS: ReadonlySet<string> = new Set(SECURITY_ALERT_EVENTS);
const HOUR_MS = 3600_000;
/** A scheduled backup is overdue when the last success is older than this many intervals. */
export const BACKUP_OVERDUE_INTERVALS = 2;

/** Only a short code-like reason (`schedule-key-missing`, `ENOSPC`) is ever echoed; anything else is left out. */
const reasonOf = (detail: Record<string, unknown> | null): string | null => {
  const reason = detail?.['reason'];
  return typeof reason === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(reason) ? reason : null;
};

/** Whether the backup outcome before `seq` was a failure; a prune failure after a created backup is not a failed backup run. */
function previousBackupFailed(db: Db, seq: number): boolean {
  const row = db.prepare(
    `SELECT event FROM audit_events WHERE seq < ? AND event IN ('backup.created', 'backup.failed')
       AND NOT (event = 'backup.failed' AND json_extract(detail_json, '$.reason') = 'prune-failed') ORDER BY seq DESC LIMIT 1`,
  ).get(seq) as { event: string } | undefined;
  return row?.event === 'backup.failed';
}

/**
 * The notification one audit row produces, or null (PD-109). One audit row maps to at most one notification and its source key is the
 * row's sequence number, so an address change (both a job outcome and a security alert) is a single `address-changed` notification and a
 * replayed row inserts nothing. Bodies are fixed short sentences; only code-like reasons and a certificate expiry date are echoed.
 */
export function notificationForAudit(db: Db, notice: AuditNotice): NewNotification | null {
  const sourceKey = `audit:${notice.seq}`;
  const { event, detail } = notice;
  switch (event) {
    case 'backup.failed': {
      const reason = reasonOf(detail);
      if (reason === 'prune-failed') {
        return { sourceKey, kind: 'backup-failed', severity: 'warning', title: 'Old backups could not be removed', body: 'The backup was created and verified, but pruning the older ones failed.' };
      }
      return { sourceKey, kind: 'backup-failed', severity: 'error', title: 'A backup failed', body: `The backup could not be completed${reason === null ? '' : ` (${reason})`}. Nothing was kept; see the backup status.` };
    }
    case 'backup.created':
      return previousBackupFailed(db, notice.seq)
        ? { sourceKey, kind: 'backup-recovered', severity: 'info', title: 'Backups are working again', body: 'A backup was created and verified after an earlier failure.' }
        : null;
    case 'tls.renewed': {
      const raw = detail?.['notAfter'];
      const notAfter = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
      return {
        sourceKey, kind: 'tls-renewed', severity: 'info', title: 'Hub certificate renewed',
        body: `The Hub certificate was renewed${detail?.['source'] === 'acme' ? ' through ACME' : ''}${notAfter === null ? '' : ` and is valid until ${notAfter}`}.`,
      };
    }
    case 'tls.acme-failed':
      return {
        sourceKey, kind: 'tls-renewal-failed', severity: 'error', title: detail?.['renewal'] === true ? 'Certificate renewal failed' : 'Certificate issuance failed',
        body: 'The Hub could not get a certificate from the ACME provider. The current certificate keeps serving; run "dude-hub tls acme status" on the Hub computer.',
      };
    case 'network.address-changed':
      return { sourceKey, kind: 'address-changed', severity: 'warning', title: 'Hub addresses changed', body: `${summarize(event, detail)} Check the DNS records for this Hub.` };
    default: {
      if (!ALERT_EVENTS.has(event)) return null;
      if (event === 'owner.sign-in' && detail?.['newAddress'] !== true) return null;
      const name = event === 'device.revoked-attempt' ? deviceName(db, notice.actorId) : null;
      return { sourceKey, kind: 'security-alert', severity: 'warning', title: 'Security alert', body: summarize(event, detail, name) };
    }
  }
}

/** The notification a failed job run produces; only the leaf renewal and sync compaction report this way (ACME failures are audited rows). */
export function notificationForJob(run: JobFinish): NewNotification | null {
  if (run.outcome !== 'failed') return null;
  const sourceKey = `job:${run.id}:${run.finishedAt}`;
  if (run.id === 'leaf-renewal') {
    return { sourceKey, kind: 'tls-renewal-failed', severity: 'error', title: 'Certificate renewal failed', body: 'The Hub could not renew its certificate. The current certificate keeps serving and the renewal is retried.' };
  }
  if (run.id === 'sync-compaction') {
    return { sourceKey, kind: 'sync-compaction-failed', severity: 'error', title: 'Sync compaction failed', body: 'Old sync history could not be compacted. Synchronization is unaffected and the run is retried.' };
  }
  return null;
}

export interface NotificationProducerOptions {
  db: Db;
  now: () => number;
  /** The job registry whose failed runs produce notifications (its `onFinish` is claimed until `stop`). */
  jobs: JobRegistry;
  /** Called with each newly stored notification (realtime and the owner view); never throws into a producer. */
  emit: (notification: HubNotification) => void;
}

export interface NotificationProducers {
  /** Stores a notification unless its source key exists, then emits it. */
  notify(input: NewNotification): HubNotification | null;
  /** The backup scheduler calls this on each check: one `backup-overdue` per UTC day while the last success is older than twice the interval. */
  checkBackupOverdue(intervalHours: number): void;
  stop(): void;
}

/** The closed list of notification producers (PD-109): audit rows, failed jobs and the backup overdue check. Nothing else creates a notification. */
export function startNotificationProducers(options: NotificationProducerOptions): NotificationProducers {
  const { db, now } = options;
  const notify = (input: NewNotification): HubNotification | null => {
    const stored = insertNotification(db, now(), input);
    if (stored !== null) {
      try { options.emit(stored); } catch { /* a delivery failure never fails the producer */ }
    }
    return stored;
  };
  const stopAudit = onAudit(db, (notice) => {
    const input = notificationForAudit(db, notice);
    if (input !== null) notify(input);
  });
  options.jobs.onFinish = (run) => {
    const input = notificationForJob(run);
    if (input !== null) notify(input);
  };

  return {
    notify,
    checkBackupOverdue(intervalHours) {
      try {
        // The last success is the newest created backup (a v2 destination run counts, Milestone 847); a schedule that has never produced
        // one is measured from when it was set. Per-destination overdue and v2 failure notifications are Milestone 850.
        const row = db.prepare("SELECT at FROM audit_events WHERE event IN ('backup.created', 'backup.v2-created', 'backup.scheduled') ORDER BY at DESC LIMIT 1").get() as { at: string } | undefined;
        if (row === undefined) return;
        const at = now();
        const age = at - Date.parse(row.at);
        if (!Number.isFinite(age) || age <= BACKUP_OVERDUE_INTERVALS * intervalHours * HOUR_MS) return;
        const hours = Math.floor(age / HOUR_MS);
        notify({
          sourceKey: `backup-overdue:${new Date(at).toISOString().slice(0, 10)}`, kind: 'backup-overdue', severity: 'warning', title: 'A scheduled backup is overdue',
          body: `No backup has completed for ${hours >= 48 ? `${Math.floor(hours / 24)} days` : `${hours} hours`}; one is due every ${intervalHours} hours.`,
        });
      } catch { /* a check failure never fails the scheduler */ }
    },
    stop() {
      stopAudit();
      options.jobs.onFinish = undefined;
    },
  };
}

declare module 'fastify' {
  interface FastifyInstance { hubNotifications: NotificationProducers }
}
