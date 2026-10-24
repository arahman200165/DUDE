import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { HUB_NOTIFICATION_BODY_MAX, HUB_NOTIFICATION_TITLE_MAX } from '@dude/contracts/hub';
import type { HubNotification, HubNotificationKind, HubNotificationSeverity, HubNotificationsResponse, MarkNotificationsReadRequest } from '@dude/contracts/hub';
import { newId } from '../util/ids.js';
import { capNotifications } from './retention.js';

/** The most notifications one list answers with (the store keeps at most 500). */
export const NOTIFICATION_LIST_LIMIT = 200;

interface Row {
  id: string; created_at: string; kind: HubNotificationKind; severity: HubNotificationSeverity; title: string; body: string; read_at: string | null; dismissed_at: string | null;
}
const COLUMNS = 'id, created_at, kind, severity, title, body, read_at, dismissed_at';

const toNotification = (row: Row): HubNotification => ({
  id: row.id, createdAt: row.created_at, kind: row.kind, severity: row.severity, title: row.title, body: row.body, readAt: row.read_at, dismissedAt: row.dismissed_at,
});

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 3)}...`);

export interface NewNotification {
  /** Deduplication key: a second insert with the same key is ignored. */
  sourceKey: string;
  kind: HubNotificationKind;
  severity: HubNotificationSeverity;
  title: string;
  body: string;
}

/** Inserts the notification unless its source key exists; returns the stored row, or null when it was a duplicate. Applies the 500 cap. */
export function insertNotification(db: Db, now: number, input: NewNotification): HubNotification | null {
  return transaction(db, () => {
    const id = newId(() => now);
    const createdAt = new Date(now).toISOString();
    const result = db.prepare('INSERT OR IGNORE INTO notifications(id, created_at, kind, severity, title, body, source_key) VALUES(?, ?, ?, ?, ?, ?, ?)').run(
      id, createdAt, input.kind, input.severity, clip(input.title, HUB_NOTIFICATION_TITLE_MAX), clip(input.body, HUB_NOTIFICATION_BODY_MAX), input.sourceKey,
    );
    if (Number(result.changes) !== 1) return null;
    capNotifications(db);
    const row = db.prepare(`SELECT ${COLUMNS} FROM notifications WHERE id = ?`).get(id) as Row | undefined;
    return row === undefined ? null : toNotification(row);
  });
}

/** Newest first; dismissed ones only on request. `unread` counts every notification neither read nor dismissed. */
export function listNotifications(db: Db, options: { includeDismissed?: boolean } = {}): HubNotificationsResponse {
  const where = options.includeDismissed === true ? '' : 'WHERE dismissed_at IS NULL';
  const rows = db.prepare(`SELECT ${COLUMNS} FROM notifications ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).all(NOTIFICATION_LIST_LIMIT) as unknown as Row[];
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL AND dismissed_at IS NULL').get() as { n: number | bigint };
  return { notifications: rows.map(toNotification), unread: Number(unread.n) };
}

/** Marks the listed (or every) notification read; already-read ones keep their time. Returns how many changed. Not audited. */
export function markNotificationsRead(db: Db, now: number, target: MarkNotificationsReadRequest): number {
  const at = new Date(now).toISOString();
  if ('all' in target) return Number(db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(at).changes);
  const update = db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL');
  return transaction(db, () => target.ids.reduce((changed, id) => changed + Number(update.run(at, id).changes), 0));
}

/** Dismisses one notification (also marking it read). False when the id is unknown; an already-dismissed one stays as it was. Not audited. */
export function dismissNotification(db: Db, now: number, id: string): boolean {
  const at = new Date(now).toISOString();
  const row = db.prepare('SELECT dismissed_at FROM notifications WHERE id = ?').get(id) as { dismissed_at: string | null } | undefined;
  if (row === undefined) return false;
  if (row.dismissed_at === null) db.prepare('UPDATE notifications SET dismissed_at = ?, read_at = COALESCE(read_at, ?) WHERE id = ?').run(at, at, id);
  return true;
}
