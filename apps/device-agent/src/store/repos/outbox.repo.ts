import { OUTBOX_MAX_ROWS } from '@dude/sync';
import type { OutboxOp } from '@dude/sync';
import type { OutboxSummary } from '@dude/persistence';
import type { Db } from '@dude/sqlite-store';

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
