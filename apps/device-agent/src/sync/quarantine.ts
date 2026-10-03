import type { Db } from '@dude/sqlite-store';
import { listQuarantined } from '../store/repos/outbox.repo.js';

/** Returns quarantined ops (the given ids, or all) to pending so they are sent again; returns how many moved. */
export function retryQuarantined(db: Db, opIds?: readonly string[]): number {
  if (opIds !== undefined && opIds.length === 0) return 0;
  const where = opIds === undefined ? '' : ` AND op_id IN (${opIds.map(() => '?').join(', ')})`;
  return Number(db.prepare(`UPDATE outbox SET status = 'pending', reason = NULL, attempts = 0, last_attempt_at = NULL WHERE status = 'quarantined'${where}`)
    .run(...(opIds ?? [])).changes);
}

/** Drops one quarantined op (the local record stays). The caller owns the two-step preview/confirm. */
export function discardQuarantined(db: Db, opId: string): boolean {
  return Number(db.prepare("DELETE FROM outbox WHERE op_id = ? AND status = 'quarantined'").run(opId).changes) > 0;
}

export interface QuarantinedExport {
  opId: string;
  entityType: string;
  entityId: string;
  opKind: string;
  schemaVersion: number;
  basedOnRevision: number | null;
  payload: unknown | null;
  reason: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A JSON-safe list of quarantined ops for the user to save before discarding. */
export function exportQuarantined(db: Db): QuarantinedExport[] {
  return listQuarantined(db).map(({ op, reason, attempts, lastAttemptAt }) => ({
    opId: op.opId, entityType: op.entityType, entityId: op.entityId, opKind: op.opKind, schemaVersion: op.schemaVersion,
    basedOnRevision: op.basedOnRevision, payload: op.payload, reason, attempts, lastAttemptAt, createdAt: op.createdAt, updatedAt: op.updatedAt,
  }));
}
