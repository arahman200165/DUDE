import type { Db } from '@dude/sqlite-store';
import type { HubNotification } from '@dude/contracts/hub';
import type { JobFinish, JobRegistry } from '../jobs/job-status.js';
import { evaluateBackupHealth } from '../hub/backup-health.js';
import type { BackupHealthInput } from '../hub/backup-health.js';
import { onAudit } from '../security/audit.js';
import type { AuditNotice } from '../security/audit.js';
import { SECURITY_ALERT_EVENTS, deviceName, summarize } from '../server/routes/security-alerts.js';
import { insertNotification } from './store.js';
import type { NewNotification } from './store.js';

const ALERT_EVENTS: ReadonlySet<string> = new Set(SECURITY_ALERT_EVENTS);
const HOUR_MS = 3600_000;
export { BACKUP_OVERDUE_INTERVALS } from '../hub/backup-health.js';

/** Only a short code-like reason (`schedule-key-missing`, `ENOSPC`) is ever echoed; anything else is left out. */
const reasonOf = (detail: Record<string, unknown> | null): string | null => {
  const reason = detail?.['reason'];
  return typeof reason === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(reason) ? reason : null;
};

/** A destination id as the Hub mints it (`d-1a2b3c4d`); anything else is never echoed or used in a source key. */
const destinationIdOf = (detail: Record<string, unknown> | null): string | null => {
  const id = detail?.['destination'];
  return typeof id === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(id) ? id : null;
};
const dayOf = (at: string): string => at.slice(0, 10);
const forDestination = (name: string | null, id: string | null): string => (name !== null ? ` to "${name}"` : id !== null ? ` to destination ${id}` : '');

/** Whether the v2 outcome of this destination before `seq` was a failure (a recovery is the first success after one). */
function previousV2Failed(db: Db, seq: number, destination: string | null): boolean {
  if (destination === null) return false;
  const row = db.prepare(
    `SELECT event FROM audit_events WHERE seq < ? AND event IN ('backup.v2-created', 'backup.v2-failed') AND json_extract(detail_json, '$.destination') = ?
       AND COALESCE(json_extract(detail_json, '$.reason'), '') != 'no-destination' ORDER BY seq DESC LIMIT 1`,
  ).get(seq, destination) as { event: string } | undefined;
  return row?.event === 'backup.v2-failed';
}

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
export function notificationForAudit(db: Db, notice: AuditNotice, destinationLabel: (id: string) => string | null = () => null): NewNotification | null {
  const sourceKey = `audit:${notice.seq}`;
  const { event, detail } = notice;
  switch (event) {
    case 'backup.v2-failed': {
      // Milestone 850. A schedule with no destination is the overdue notification's case, not a failed run (the scheduler records it on every check).
      const reason = reasonOf(detail);
      if (reason === 'no-destination') return null;
      const id = destinationIdOf(detail);
      // One per destination, reason and UTC day: a destination retried every few hours while it stays broken is one notification a day.
      return {
        sourceKey: `backup-failed:${id ?? 'hub'}:${reason ?? 'unknown'}:${dayOf(notice.at)}`, kind: 'backup-failed', severity: 'error', title: 'A backup failed',
        body: `The backup${forDestination(id === null ? null : destinationLabel(id), id)} could not be completed${reason === null ? '' : ` (${reason})`}. It will be retried; see the backup status.`,
      };
    }
    case 'backup.v2-created': {
      const id = destinationIdOf(detail);
      return previousV2Failed(db, notice.seq, id)
        ? { sourceKey, kind: 'backup-recovered', severity: 'info', title: 'Backups are working again', body: `A backup${forDestination(id === null ? null : destinationLabel(id), id)} was created and verified after an earlier failure.` }
        : null;
    }
    case 'backup.drill-failed': {
      const reason = reasonOf(detail);
      const id = destinationIdOf(detail);
      return {
        sourceKey: `drill-failed:${id ?? 'hub'}:${dayOf(notice.at)}`, kind: 'backup-failed', severity: 'error', title: 'A restore drill failed',
        body: `The newest backup${forDestination(id === null ? null : destinationLabel(id), id)} could not be restored into a scratch folder${reason === null ? '' : ` (${reason})`}. It is retried daily; see the backup status.`,
      };
    }
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
    case 'power.regressed': {
      // Milestone 851. No new kind: a sleeping Hub misses scheduled backups, so it is delivered as `backup-overdue` (adding a kind would touch the desktop
      // preferences, the Hub-web preferences panel and the Agent's event allowlist). One audit row per regression episode, so one notification.
      const never = detail?.['reason'] === 'not-applied';
      return {
        sourceKey, kind: 'backup-overdue', severity: 'warning', title: 'The Hub computer may go to sleep',
        body: `${never ? 'The Hub computer is allowed to sleep or hibernate on AC power' : 'The Hub computer can sleep or hibernate on AC power again'}; while it sleeps the tunnel is down and scheduled backups do not run. On that computer, in an elevated terminal, run "dude-hub power apply".`,
      };
    }
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
  /** The owner's label for a destination id (from `hub.json`), echoed in a body; null when unknown. */
  destinationLabel?: (id: string) => string | null;
}

export interface NotificationProducers {
  /** Stores a notification unless its source key exists, then emits it. */
  notify(input: NewNotification): HubNotification | null;
  /**
   * The backup scheduler calls this on each check (and the restore drill after each verdict): one `backup-overdue` per destination and UTC
   * day while its last success (or, never having succeeded, its schedule) is twice the interval old, and one for a schedule with no destination.
   */
  checkBackupHealth(input: BackupHealthInput): void;
  stop(): void;
}

/** The closed list of notification producers (PD-109): audit rows (backup runs and restore drills included, Milestone 850), failed jobs and the backup health check. Nothing else creates a notification. */
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
    const input = notificationForAudit(db, notice, options.destinationLabel);
    if (input !== null) notify(input);
  });
  options.jobs.onFinish = (run) => {
    const input = notificationForJob(run);
    if (input !== null) notify(input);
  };

  return {
    notify,
    checkBackupHealth(input) {
      try {
        const at = now();
        const day = new Date(at).toISOString().slice(0, 10);
        const age = (ageMs: number): string => { const hours = Math.floor(ageMs / HOUR_MS); return hours >= 48 ? `${Math.floor(hours / 24)} days` : `${hours} hours`; };
        const interval = input.schedule?.intervalHours;
        if (interval === undefined) return;
        const health = evaluateBackupHealth(db, input, at);
        for (const d of health.destinations) {
          if (d.overdue === null) continue;
          notify({
            sourceKey: `backup-overdue:${d.id}:${day}`, kind: 'backup-overdue', severity: 'warning', title: 'A scheduled backup is overdue',
            body: `No backup to "${d.label}" has completed for ${age(d.overdue.ageMs)}; one is due every ${interval} hours.`,
          });
        }
        if (health.noDestination !== null) {
          notify({
            sourceKey: `backup-overdue:none:${day}`, kind: 'backup-overdue', severity: 'warning', title: 'A scheduled backup is overdue',
            body: `Backups are scheduled every ${interval} hours but no backup destination exists, so none has run for ${age(health.noDestination.ageMs)}. Add one with "dude-hub backup destination add".`,
          });
        }
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
