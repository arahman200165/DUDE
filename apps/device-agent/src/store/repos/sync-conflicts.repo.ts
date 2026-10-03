import type { Db } from '@dude/sqlite-store';

export type SyncConflictKind = 'edit-edit' | 'edit-delete' | 'delete-edit' | 'first-sync';

export interface SyncConflict {
  id: number;
  entityType: string;
  entityId: string;
  kind: SyncConflictKind;
  localPayload: unknown | null;
  localDeleted: boolean;
  basePayload: unknown | null;
  remotePayload: unknown | null;
  remoteDeleted: boolean;
  remoteRevision: number | null;
  fields: string[];
  detectedAt: string;
}

export type NewSyncConflict = Omit<SyncConflict, 'id'>;

interface Raw {
  id: number; entity_type: string; entity_id: string; kind: SyncConflictKind; local_payload_json: string | null; local_deleted: number;
  base_payload_json: string | null; remote_payload_json: string | null; remote_deleted: number; remote_revision: number | null;
  fields_json: string; detected_at: string;
}

const parse = (json: string | null): unknown | null => (json === null ? null : JSON.parse(json));
const stringify = (value: unknown | null): string | null => (value === null || value === undefined ? null : JSON.stringify(value));

function fromRow(r: Raw): SyncConflict {
  return {
    id: Number(r.id), entityType: r.entity_type, entityId: r.entity_id, kind: r.kind,
    localPayload: parse(r.local_payload_json), localDeleted: Number(r.local_deleted) === 1,
    basePayload: parse(r.base_payload_json), remotePayload: parse(r.remote_payload_json), remoteDeleted: Number(r.remote_deleted) === 1,
    remoteRevision: r.remote_revision === null ? null : Number(r.remote_revision), fields: JSON.parse(r.fields_json) as string[], detectedAt: r.detected_at,
  };
}

/** Records a conflict and returns its id. */
export function insertConflict(db: Db, c: NewSyncConflict): number {
  const result = db.prepare(
    `INSERT INTO sync_conflicts(entity_type, entity_id, kind, local_payload_json, local_deleted, base_payload_json, remote_payload_json, remote_deleted, remote_revision, fields_json, detected_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(c.entityType, c.entityId, c.kind, stringify(c.localPayload), c.localDeleted ? 1 : 0, stringify(c.basePayload), stringify(c.remotePayload),
    c.remoteDeleted ? 1 : 0, c.remoteRevision, JSON.stringify(c.fields), c.detectedAt);
  return Number(result.lastInsertRowid);
}

export function listConflicts(db: Db): SyncConflict[] {
  return (db.prepare('SELECT * FROM sync_conflicts ORDER BY id').all() as unknown as Raw[]).map(fromRow);
}

export function getConflict(db: Db, id: number): SyncConflict | undefined {
  const r = db.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(id) as unknown as Raw | undefined;
  return r ? fromRow(r) : undefined;
}

export function deleteConflict(db: Db, id: number): boolean {
  return Number(db.prepare('DELETE FROM sync_conflicts WHERE id = ?').run(id).changes) > 0;
}

export function countConflicts(db: Db): number {
  return Number((db.prepare('SELECT COUNT(*) AS n FROM sync_conflicts').get() as unknown as { n: number }).n);
}
