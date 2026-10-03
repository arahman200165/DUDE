import { SYNC_ENTITY_TYPES, isSyncEntityType } from '@dude/sync';
import type { SyncRecord } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { transaction } from '@dude/sqlite-store';
import { insertConflict } from '../store/repos/sync-conflicts.repo.js';
import { applyRemoteChanges, dropOp, getOp, toAppliedChange } from './apply-remote.js';
import type { AppliedChange, SyncApplyContext } from './apply-remote.js';
import { entityKeyOfKv, readLocal, removeLocal } from './sync-entities.js';

const keyOf = (entityType: string, entityId: string): string => `${entityType}\u0000${entityId}`;

/** Accumulates what a (paged) snapshot has shown so the final step can find entities the Hub no longer has. */
export interface SnapshotCollector {
  seen: Set<string>;
  applied: AppliedChange[];
  deferred: SyncRecord[];
  conflicts: number;
}

export function beginSnapshot(): SnapshotCollector {
  return { seen: new Set(), applied: [], deferred: [], conflicts: 0 };
}

/** Applies one page of live snapshot records through the normal pull rules and remembers their keys. */
export function applySnapshotPage(db: Db, collector: SnapshotCollector, records: readonly SyncRecord[], ctx: SyncApplyContext): void {
  const result = applyRemoteChanges(db, records, ctx);
  for (const r of records) collector.seen.add(keyOf(r.entityType, r.entityId));
  collector.applied.push(...result.applied);
  collector.deferred.push(...result.deferred);
  collector.conflicts += result.conflicts;
}

interface SyncedKey { entityType: string; entityId: string }

/** Every local sync-entity the Hub has acknowledged as live (a hub revision and, for kv keys, a non-tombstone base). */
function localSyncedKeys(db: Db): SyncedKey[] {
  const keys: SyncedKey[] = [];
  const marks = SYNC_ENTITY_TYPES.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT entity_type, entity_id FROM records WHERE hub_revision IS NOT NULL AND entity_type IN (${marks})`)
    .all(...SYNC_ENTITY_TYPES) as unknown as Array<{ entity_type: string; entity_id: string }>;
  for (const r of rows) keys.push({ entityType: r.entity_type, entityId: r.entity_id });
  const kvRows = db.prepare('SELECT s.namespace, s.key FROM kv_sync s JOIN kv ON kv.namespace = s.namespace AND kv.key = s.key WHERE s.hub_revision IS NOT NULL AND s.base_json IS NOT NULL')
    .all() as unknown as Array<{ namespace: string; key: string }>;
  for (const r of kvRows) {
    const k = entityKeyOfKv(r.namespace, r.key);
    if (isSyncEntityType(k.entityType)) keys.push(k);
  }
  return keys;
}

export interface SnapshotResult {
  applied: AppliedChange[];
  deferred: SyncRecord[];
  conflicts: number;
  /** Local entities deleted because the Hub no longer has them. */
  deletedLocally: number;
}

/**
 * Last step of a snapshot: a local entity the Hub had acknowledged but the snapshot does not contain was deleted on
 * the Hub. With a pending edit it is an edit-delete conflict (the Hub state, deletion, wins locally); otherwise it is
 * deleted locally. Never-synced entities (no hub revision) are untouched and their ops stay pending.
 */
export function finishSnapshot(
  db: Db, collector: SnapshotCollector, ctx: SyncApplyContext,
  /** Restricts which entity types may be deleted locally (a disabled category's rows are never touched). */
  includeType: (entityType: string) => boolean = () => true,
): SnapshotResult {
  const result: SnapshotResult = { applied: collector.applied, deferred: collector.deferred, conflicts: collector.conflicts, deletedLocally: 0 };
  transaction(db, () => {
    for (const { entityType, entityId } of localSyncedKeys(db)) {
      if (!includeType(entityType) || collector.seen.has(keyOf(entityType, entityId))) continue;
      const local = readLocal(db, entityType, entityId);
      if (!local.exists) continue;
      const op = getOp(db, entityType, entityId);
      if (op && op.opKind === 'upsert') {
        insertConflict(db, {
          entityType, entityId, kind: 'edit-delete', localPayload: op.payload, localDeleted: false, basePayload: local.base,
          remotePayload: null, remoteDeleted: true, remoteRevision: null, fields: [], detectedAt: ctx.now().toISOString(),
        });
        result.conflicts += 1;
      }
      if (op) dropOp(db, op.opId);
      removeLocal(db, entityType, entityId);
      result.deletedLocally += 1;
      result.applied.push(toAppliedChange(entityType, entityId, true, null));
    }
  });
  return result;
}

/** One-shot form of the paged API, for a snapshot that fits in memory. */
export function applySnapshot(db: Db, liveRecords: readonly SyncRecord[], ctx: SyncApplyContext): SnapshotResult {
  const collector = beginSnapshot();
  applySnapshotPage(db, collector, liveRecords, ctx);
  return finishSnapshot(db, collector, ctx);
}
