import type { Db } from '@dude/sqlite-store';

/** A dismissed notification is kept this long after it was dismissed (PD-109). */
export const DISMISSED_RETENTION_MS = 30 * 24 * 3600_000;
/** Every notification is removed this long after it was created. */
export const NOTIFICATION_MAX_AGE_MS = 90 * 24 * 3600_000;
/** At most this many notifications are kept (the newest). */
export const NOTIFICATION_CAP = 500;
export const NOTIFICATION_PRUNE_INTERVAL_MS = 24 * 3600_000;

/** Keeps the newest `NOTIFICATION_CAP` rows. Run on every insert. Returns the number deleted. */
export function capNotifications(db: Db, cap = NOTIFICATION_CAP): number {
  const result = db.prepare('DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY created_at DESC, id DESC LIMIT ?)').run(cap);
  return Number(result.changes);
}

/** Deletes dismissed notifications older than 30 days and every notification older than 90 days, then applies the cap. Returns the number deleted. */
export function pruneNotifications(db: Db, now: number, cap = NOTIFICATION_CAP): number {
  const dismissed = db.prepare('DELETE FROM notifications WHERE dismissed_at IS NOT NULL AND dismissed_at < ?').run(new Date(now - DISMISSED_RETENTION_MS).toISOString());
  const aged = db.prepare('DELETE FROM notifications WHERE created_at < ?').run(new Date(now - NOTIFICATION_MAX_AGE_MS).toISOString());
  return Number(dismissed.changes) + Number(aged.changes) + capNotifications(db, cap);
}

/** Prunes now and every 24 h; `onPruned` runs only when something was deleted. The timer is unref'd; call the returned function to stop it. */
export function startNotificationRetention(db: Db, now: () => number, onPruned: () => void, intervalMs = NOTIFICATION_PRUNE_INTERVAL_MS): () => void {
  const run = (): void => {
    try { if (pruneNotifications(db, now()) > 0) onPruned(); } catch { /* the database may be closing */ }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
