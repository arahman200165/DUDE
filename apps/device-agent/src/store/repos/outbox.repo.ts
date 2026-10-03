import { OUTBOX_MAX_ROWS, SYNC_ENTITY_TYPES, categoryOf } from '@dude/sync';
import type { OutboxOp, OutboxStatus, SyncCategory } from '@dude/sync';
import type { OutboxSummary } from '@dude/persistence';
import type { Db } from '@dude/sqlite-store';
import { getEnrollment } from './hub-enrollment.repo.js';

export interface OutboxRow {
  op_id: string; entity_type: string; entity_id: string; environment_id: string; device_id: string; op_kind: string;
  schema_version: number; based_on_revision: number | null; local_revision: number; payload_json: string | null;
  status: string; created_at: string; updated_at: string;
}

export function rowToOp(row: OutboxRow): OutboxOp {
  return {
    opId: row.op_id,
    environmentId: row.environment_id,
    deviceId: row.device_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    opKind: row.op_kind as OutboxOp['opKind'],
    schemaVersion: row.schema_version,
    basedOnRevision: row.based_on_revision,
    localRevision: row.local_revision,
    payload: row.payload_json === null ? null : JSON.parse(row.payload_json),
    status: row.status as OutboxOp['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function outboxCount(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM outbox').get() as { n: number }).n;
}

export function outboxSummary(db: Db, maxRows: number = OUTBOX_MAX_ROWS): OutboxSummary {
  const pending = outboxCount(db);
  return { pending, maxRows, backpressure: pending >= maxRows };
}

export function listOutbox(db: Db, limit: number): OutboxOp[] {
  const rows = db.prepare('SELECT * FROM outbox ORDER BY created_at, op_id LIMIT ?').all(Math.max(0, Math.floor(limit))) as unknown as OutboxRow[];
  return rows.map(rowToOp);
}

/** Status a freshly journaled op gets: pending when enrolled, stranded when the enrollment was revoked, else unsent-standalone. */
export function opStatusAtWrite(db: Db): OutboxStatus {
  const state = getEnrollment(db)?.state;
  if (state === 'enrolled') return 'pending';
  if (state === 'revoked') return 'stranded';
  return 'unsent-standalone';
}

type CategoryMap = Readonly<Record<SyncCategory, boolean>>;

const isEnabled = (map: CategoryMap, entityType: string): boolean => {
  const category = categoryOf(entityType);
  return category !== undefined && map[category];
};

/** Pending ops whose category is enabled, oldest first. Quarantined, stranded and standalone ops are never sendable. */
export function listSendable(db: Db, enabledCategories: CategoryMap, limit: number): OutboxOp[] {
  const types = SYNC_ENTITY_TYPES.filter((t) => isEnabled(enabledCategories, t));
  if (types.length === 0) return [];
  const marks = types.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT * FROM outbox WHERE status = 'pending' AND entity_type IN (${marks}) ORDER BY created_at, op_id LIMIT ?`)
    .all(...types, Math.max(0, Math.floor(limit))) as unknown as OutboxRow[];
  return rows.map(rowToOp);
}

export function markQuarantined(db: Db, opId: string, reason: string): boolean {
  return Number(db.prepare("UPDATE outbox SET status = 'quarantined', reason = ? WHERE op_id = ?").run(reason, opId).changes) > 0;
}

export function markAttempt(db: Db, opId: string, at: string): void {
  db.prepare('UPDATE outbox SET attempts = attempts + 1, last_attempt_at = ? WHERE op_id = ?').run(at, opId);
}

/** Removes an op only if it was not coalesced or edited since it was sent (same op id and updated_at). */
export function deleteIfUnchanged(db: Db, opId: string, updatedAt: string): boolean {
  return Number(db.prepare('DELETE FROM outbox WHERE op_id = ? AND updated_at = ?').run(opId, updatedAt).changes) > 0;
}

/** Moves every op in the `from` statuses to `to` (e.g. enrolling turns unsent-standalone into pending); returns the count. */
export function setStatusAll(db: Db, from: readonly OutboxStatus[], to: OutboxStatus): number {
  if (from.length === 0) return 0;
  const marks = from.map(() => '?').join(', ');
  return Number(db.prepare(`UPDATE outbox SET status = ?, reason = NULL WHERE status IN (${marks})`).run(to, ...from).changes);
}

export interface OutboxStatusCounts {
  /** Pending and sendable now. */
  pending: number;
  /** Pending but derived-held: the category is disabled or the first sync is not done. */
  held: number;
  quarantined: number;
  stranded: number;
  unsentStandalone: number;
}

export function outboxCountsByStatus(db: Db, enabledCategories: CategoryMap, firstSyncDone: boolean): OutboxStatusCounts {
  const rows = db.prepare('SELECT entity_type, status, COUNT(*) AS n FROM outbox GROUP BY entity_type, status').all() as unknown as Array<{ entity_type: string; status: string; n: number }>;
  const counts: OutboxStatusCounts = { pending: 0, held: 0, quarantined: 0, stranded: 0, unsentStandalone: 0 };
  for (const r of rows) {
    const n = Number(r.n);
    if (r.status === 'pending') {
      if (firstSyncDone && isEnabled(enabledCategories, r.entity_type)) counts.pending += n;
      else counts.held += n;
    } else if (r.status === 'quarantined') counts.quarantined += n;
    else if (r.status === 'stranded') counts.stranded += n;
    else counts.unsentStandalone += n;
  }
  return counts;
}

export interface QuarantinedOp { op: OutboxOp; reason: string | null; attempts: number; lastAttemptAt: string | null }

export function listQuarantined(db: Db): QuarantinedOp[] {
  const rows = db.prepare("SELECT * FROM outbox WHERE status = 'quarantined' ORDER BY created_at, op_id").all() as unknown as Array<OutboxRow & { reason: string | null; attempts: number; last_attempt_at: string | null }>;
  return rows.map((r) => ({ op: rowToOp(r), reason: r.reason, attempts: Number(r.attempts), lastAttemptAt: r.last_attempt_at }));
}

export interface UnsentOpCounts { pending: number; quarantined: number; stranded: number; total: number }

/** Ops that never reached a Hub: pending (held ones included), quarantined and stranded. Standalone-journaled ops are not "unsent" to anything. */
export function unsentOpCounts(db: Db): UnsentOpCounts {
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM outbox WHERE status IN ('pending', 'quarantined', 'stranded') GROUP BY status").all() as unknown as Array<{ status: string; n: number }>;
  const counts: UnsentOpCounts = { pending: 0, quarantined: 0, stranded: 0, total: 0 };
  for (const r of rows) {
    const n = Number(r.n);
    if (r.status === 'pending') counts.pending = n;
    else if (r.status === 'quarantined') counts.quarantined = n;
    else counts.stranded = n;
    counts.total += n;
  }
  return counts;
}
