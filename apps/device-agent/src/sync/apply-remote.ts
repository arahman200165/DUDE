import { SETTING_ENTITY_TYPE } from '@dude/persistence';
import { merge3, syncPolicyFor } from '@dude/sync';
import type { OutboxOp } from '@dude/sync';
import type { SyncRecord } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { transaction } from '@dude/sqlite-store';
import { rowToOp } from '../store/repos/outbox.repo.js';
import type { OutboxRow } from '../store/repos/outbox.repo.js';
import { insertConflict } from '../store/repos/sync-conflicts.repo.js';
import type { SyncConflictKind } from '../store/repos/sync-conflicts.repo.js';
import { applyRemote, localSchemaVersion, readLocal, setBase } from './sync-entities.js';
import type { RemoteWriteContext } from './sync-entities.js';

export interface SyncApplyContext extends RemoteWriteContext {
  newOpId: () => string;
}

/** A local change the renderer must learn about. For `setting` entities `namespace`/`key`/`value` are also set. */
export interface AppliedChange {
  entityType: string;
  entityId: string;
  deleted: boolean;
  payload: unknown | null;
  namespace?: string;
  key?: string;
  value?: unknown;
}

export interface ApplyResult {
  applied: AppliedChange[];
  /** Records written by a newer schema than this build understands; not applied (the caller surfaces "needs update"). */
  deferred: SyncRecord[];
  /** Number of conflict rows inserted. */
  conflicts: number;
}

export const toAppliedChange = (entityType: string, entityId: string, deleted: boolean, payload: unknown | null): AppliedChange => {
  const change: AppliedChange = { entityType, entityId, deleted, payload: deleted ? null : payload };
  if (entityType === SETTING_ENTITY_TYPE) {
    if (!deleted && payload !== null && typeof payload === 'object') {
      const p = payload as { namespace?: string; key?: string; value?: unknown };
      if (typeof p.namespace === 'string' && typeof p.key === 'string') {
        change.namespace = p.namespace;
        change.key = p.key;
        change.value = p.value;
      }
    } else if (deleted) {
      const i = entityId.indexOf(':');
      if (i > 0) { change.namespace = entityId.slice(0, i); change.key = entityId.slice(i + 1); }
    }
  }
  return change;
};

export function getOp(db: Db, entityType: string, entityId: string): OutboxOp | undefined {
  const row = db.prepare('SELECT * FROM outbox WHERE entity_type = ? AND entity_id = ?').get(entityType, entityId) as unknown as OutboxRow | undefined;
  return row ? rowToOp(row) : undefined;
}

function rebaseOp(db: Db, op: OutboxOp, revision: number): void {
  db.prepare('UPDATE outbox SET based_on_revision = ? WHERE op_id = ?').run(revision, op.opId);
}

function replaceOpPayload(db: Db, op: OutboxOp, payload: unknown, revision: number, ctx: SyncApplyContext): void {
  // A new op id and stamp, so an in-flight push of the old payload can never delete (or be mistaken for) this one.
  db.prepare('UPDATE outbox SET op_id = ?, payload_json = ?, based_on_revision = ?, updated_at = ?, reason = NULL, attempts = 0, last_attempt_at = NULL WHERE op_id = ?')
    .run(ctx.newOpId(), JSON.stringify(payload), revision, ctx.now().toISOString(), op.opId);
}

export function dropOp(db: Db, opId: string): void {
  db.prepare('DELETE FROM outbox WHERE op_id = ?').run(opId);
}

export interface ReconcileOutcome {
  change?: AppliedChange;
  conflict?: boolean;
  deferred?: boolean;
  skipped?: boolean;
}

/**
 * The shared pull rule for one Hub record R against local state (used for pulled changes, snapshot records and push
 * `conflict` results). Must run inside a transaction. `force` skips the "already at or past R" check.
 */
export function reconcileRemote(db: Db, record: SyncRecord, ctx: SyncApplyContext, force = false): ReconcileOutcome {
  const policy = syncPolicyFor(record.entityType);
  if (!policy) return { skipped: true };
  if (!record.deleted && record.schemaVersion > localSchemaVersion(record.entityType)) return { deferred: true };

  const local = readLocal(db, record.entityType, record.entityId);
  if (!force && local.hubRevision !== null && local.hubRevision >= record.revision) return { skipped: true };

  const remotePayload = record.deleted ? null : record.payload;
  const apply = (): AppliedChange => {
    applyRemote(db, record, ctx);
    return toAppliedChange(record.entityType, record.entityId, record.deleted, remotePayload);
  };

  const op = getOp(db, record.entityType, record.entityId);
  if (!op) return { change: apply() };

  if (policy.conflict !== 'merge3') {
    // lww / per-device: the local op stays and wins later by Hub order; it is now based on R.
    rebaseOp(db, op, record.revision);
    setBase(db, record.entityType, record.entityId, record.revision, remotePayload);
    return {};
  }

  const localDeleted = op.opKind === 'delete';
  if (localDeleted && record.deleted) {
    dropOp(db, op.opId);
    return { change: apply() };
  }

  let kind: SyncConflictKind;
  let fields: string[] = [];
  if (localDeleted) kind = 'delete-edit';
  else if (record.deleted) kind = 'edit-delete';
  else {
    const merged = merge3(local.base, op.payload, record.payload, policy.fieldRules);
    if (merged.kind === 'merged') {
      applyRemote(db, { ...record, payload: merged.value }, ctx);
      setBase(db, record.entityType, record.entityId, record.revision, record.payload);
      replaceOpPayload(db, op, merged.value, record.revision, ctx);
      return { change: toAppliedChange(record.entityType, record.entityId, false, merged.value) };
    }
    kind = 'edit-edit';
    fields = merged.fields;
  }

  insertConflict(db, {
    entityType: record.entityType, entityId: record.entityId, kind,
    localPayload: localDeleted ? null : op.payload, localDeleted,
    basePayload: local.base, remotePayload, remoteDeleted: record.deleted, remoteRevision: record.revision,
    fields, detectedAt: ctx.now().toISOString(),
  });
  const change = apply();
  dropOp(db, op.opId);
  return { change, conflict: true };
}

/** Applies pulled Hub records (revision order) by the spec's pull rules. Writes outbox rows only to rebase/replace/drop an existing op. */
export function applyRemoteChanges(db: Db, records: readonly SyncRecord[], ctx: SyncApplyContext): ApplyResult {
  const result: ApplyResult = { applied: [], deferred: [], conflicts: 0 };
  transaction(db, () => {
    for (const record of records) {
      const outcome = reconcileRemote(db, record, ctx);
      if (outcome.deferred) result.deferred.push(record);
      if (outcome.change) result.applied.push(outcome.change);
      if (outcome.conflict) result.conflicts += 1;
    }
  });
  return result;
}
