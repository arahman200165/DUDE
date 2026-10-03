import type { SyncRecord } from '@dude/contracts/hub';
import { allRows, getMeta, getRow, setMeta, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { categoryOf, SYNC_CATEGORY_IDS } from '@dude/sync';
import type { SyncCategory } from '@dude/sync';

/** Raw `records` row. */
export interface RecordRow {
  environment_id: string; entity_type: string; entity_id: string; scope: string; schema_version: number; revision: number;
  payload_json: string | null; deleted: number; updated_at: string; updated_by_device_id: string | null;
}

/** Map a stored record row (live or tombstone) to the wire `SyncRecord`. */
export function toSyncRecord(row: RecordRow): SyncRecord {
  return {
    entityType: row.entity_type,
    entityId: row.entity_id,
    revision: row.revision,
    deleted: row.deleted === 1,
    payload: row.deleted === 1 || row.payload_json === null ? null : JSON.parse(row.payload_json),
    schemaVersion: row.schema_version,
    updatedAt: row.updated_at,
    updatedByDeviceId: row.updated_by_device_id,
  };
}

export function getSyncRecord(db: Db, environmentId: string, entityType: string, entityId: string): SyncRecord | undefined {
  const row = getRow<RecordRow>(
    db.prepare('SELECT * FROM records WHERE environment_id = ? AND entity_type = ? AND entity_id = ?'), environmentId, entityType, entityId);
  return row ? toSyncRecord(row) : undefined;
}

/** Records (live and tombstones) whose current revision is > `after`, ordered by revision. An entity appears once. */
export function changesAfter(db: Db, environmentId: string, after: number, limit: number): { changes: SyncRecord[]; hasMore: boolean } {
  const size = Math.max(0, Math.floor(limit));
  const rows = allRows<RecordRow>(
    db.prepare('SELECT * FROM records WHERE environment_id = ? AND revision > ? ORDER BY revision LIMIT ?'), environmentId, after, size + 1);
  return { changes: rows.slice(0, size).map(toSyncRecord), hasMore: rows.length > size };
}

/** Live records ordered by (entity_type, entity_id), strictly after the (afterType, afterId) key when given. */
export function snapshotPage(
  db: Db, environmentId: string, afterType: string | undefined, afterId: string | undefined, limit: number,
): { records: SyncRecord[]; next: { afterType: string; afterId: string } | null } {
  const size = Math.max(0, Math.floor(limit));
  const rows = afterType === undefined
    ? allRows<RecordRow>(
      db.prepare('SELECT * FROM records WHERE environment_id = ? AND deleted = 0 ORDER BY entity_type, entity_id LIMIT ?'), environmentId, size + 1)
    : allRows<RecordRow>(
      db.prepare(`SELECT * FROM records WHERE environment_id = ? AND deleted = 0 AND (entity_type > ? OR (entity_type = ? AND entity_id > ?))
        ORDER BY entity_type, entity_id LIMIT ?`), environmentId, afterType, afterType, afterId ?? '', size + 1);
  const page = rows.slice(0, size);
  const last = page[page.length - 1];
  return { records: page.map(toSyncRecord), next: rows.length > size && last ? { afterType: last.entity_type, afterId: last.entity_id } : null };
}

export function getSyncFloor(db: Db): number {
  return Number(getMeta(db, 'sync_floor') ?? '0') || 0;
}
export function setSyncFloor(db: Db, floor: number): void {
  if (floor > getSyncFloor(db)) setMeta(db, 'sync_floor', String(Math.floor(floor)));
}
export function getRetentionDays(db: Db): number {
  const n = Number(getMeta(db, 'sync_retention_days') ?? '90');
  return Number.isFinite(n) && n > 0 ? n : 90;
}

/**
 * Compact history up to `floor`: drop change-feed rows <= floor, hard-delete tombstones with revision <= floor and applied-op
 * markers older than `appliedOpsOlderThanIso`; raise the floor (monotonic). Live records are never touched.
 */
export function compactBefore(
  db: Db, floor: number, appliedOpsOlderThanIso: string,
): { changeFeed: number; tombstones: number; appliedOps: number; floor: number } {
  return transaction(db, () => {
    const changeFeed = Number(db.prepare('DELETE FROM change_feed WHERE revision <= ?').run(floor).changes);
    const tombstones = Number(db.prepare('DELETE FROM records WHERE deleted = 1 AND revision <= ?').run(floor).changes);
    const appliedOps = Number(db.prepare('DELETE FROM applied_ops WHERE applied_at < ?').run(appliedOpsOlderThanIso).changes);
    setSyncFloor(db, floor);
    return { changeFeed, tombstones, appliedOps, floor: getSyncFloor(db) };
  });
}

export interface DeviceSyncReport {
  cursor: number;
  pending: number;
  quarantined: number;
  conflicts: number;
  stranded: number;
  categories: Record<string, boolean>;
  lastSyncAt: string | null;
}

export interface DeviceSyncStateRow {
  deviceId: string;
  cursor: number;
  reported: Omit<DeviceSyncReport, 'cursor'> | null;
  lastPushAt: string | null;
  lastPullAt: string | null;
  updatedAt: string;
}

/** Upsert a device's reported state. `report` is the `PUT /sync/state` body; push/pull timestamps are set via `touch`. */
export function recordDeviceSyncState(
  db: Db, deviceId: string, report: DeviceSyncReport | null, now: string, touch: { push?: boolean; pull?: boolean; cursor?: number } = {},
): void {
  const { cursor: _cursor, ...reported } = report ?? ({} as Partial<DeviceSyncReport>);
  void _cursor;
  const cursor = report?.cursor ?? touch.cursor ?? null;
  db.prepare(
    `INSERT INTO device_sync_state(device_id, cursor, reported_json, last_push_at, last_pull_at, updated_at) VALUES(?, COALESCE(?, 0), ?, ?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET
       cursor = COALESCE(?, cursor), reported_json = COALESCE(?, reported_json),
       last_push_at = COALESCE(?, last_push_at), last_pull_at = COALESCE(?, last_pull_at), updated_at = excluded.updated_at`,
  ).run(
    deviceId, cursor, report ? JSON.stringify(reported) : null, touch.push ? now : null, touch.pull ? now : null, now,
    cursor, report ? JSON.stringify(reported) : null, touch.push ? now : null, touch.pull ? now : null,
  );
}

export function listDeviceSyncState(db: Db): DeviceSyncStateRow[] {
  return allRows<{
    device_id: string; cursor: number; reported_json: string | null; last_push_at: string | null; last_pull_at: string | null; updated_at: string;
  }>(db.prepare('SELECT * FROM device_sync_state ORDER BY device_id')).map((r) => ({
    deviceId: r.device_id, cursor: r.cursor, reported: r.reported_json ? JSON.parse(r.reported_json) : null,
    lastPushAt: r.last_push_at, lastPullAt: r.last_pull_at, updatedAt: r.updated_at,
  }));
}

/** Live record counts per entity type. */
export function countLiveRecordsByType(db: Db, environmentId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of allRows<{ entity_type: string; n: number }>(
    db.prepare('SELECT entity_type, COUNT(*) AS n FROM records WHERE environment_id = ? AND deleted = 0 GROUP BY entity_type'), environmentId)) {
    out[r.entity_type] = r.n;
  }
  return out;
}

/** Live record counts grouped by sync category (every category present). */
export function countLiveRecordsByCategory(db: Db, environmentId: string): Record<SyncCategory, number> {
  const out = Object.fromEntries(SYNC_CATEGORY_IDS.map((c) => [c, 0])) as Record<SyncCategory, number>;
  for (const [type, n] of Object.entries(countLiveRecordsByType(db, environmentId))) {
    const category = categoryOf(type);
    if (category) out[category] += n;
  }
  return out;
}
