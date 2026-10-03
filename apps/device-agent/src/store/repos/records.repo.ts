import { ENTITY_CODECS, isKnownEntityType } from '@dude/persistence';
import type { Db } from '@dude/sqlite-store';
import { transaction } from '@dude/sqlite-store';

export { listRecords } from '../entity-commit.js';
export type { StoredRecord } from '../entity-commit.js';

/** Records the Hub's current revision and version of a record (the merge base) after a push result or a pull. */
export function setHubState(db: Db, entityType: string, entityId: string, hubRevision: number | null, hubPayload: unknown | null): boolean {
  const json = hubPayload === null || hubPayload === undefined ? null : JSON.stringify(hubPayload);
  return Number(db.prepare('UPDATE records SET hub_revision = ?, hub_payload_json = ? WHERE entity_type = ? AND entity_id = ?').run(hubRevision, json, entityType, entityId).changes) > 0;
}

export interface RemoteRecordWrite {
  entityType: string;
  entityId: string;
  /** Encoded payload exactly as the Hub holds it; becomes both the local row and the merge base. */
  payload: unknown;
  hubRevision: number;
  environmentId: string;
  now: Date;
  /** Defaults to the codec's current schema version. */
  schemaVersion?: number;
}

/** Writes a record the Hub sent, WITHOUT journaling (no outbox op): it is already canonical. Throws for an unknown entity type. */
export function applyRemoteRecord(db: Db, w: RemoteRecordWrite): void {
  if (!isKnownEntityType(w.entityType)) throw new Error(`Unknown entity type "${w.entityType}".`);
  const codec = ENTITY_CODECS[w.entityType];
  const stamp = w.now.toISOString();
  const json = JSON.stringify(w.payload);
  transaction(db, () => {
    db.prepare(
      `INSERT INTO records(entity_type, entity_id, environment_id, scope, schema_version, local_revision, hub_revision, hub_payload_json, payload_json, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET
         scope = excluded.scope, schema_version = excluded.schema_version, local_revision = records.local_revision + 1,
         hub_revision = excluded.hub_revision, hub_payload_json = excluded.hub_payload_json, payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
    ).run(w.entityType, w.entityId, w.environmentId, codec.scope, w.schemaVersion ?? codec.schemaVersion, w.hubRevision, json, json, stamp, stamp);
  });
}

/** Removes a record the Hub deleted, WITHOUT journaling. */
export function applyRemoteDelete(db: Db, entityType: string, entityId: string): boolean {
  return Number(db.prepare('DELETE FROM records WHERE entity_type = ? AND entity_id = ?').run(entityType, entityId).changes) > 0;
}
