import { SYNC_ENTITY_TYPES, isSyncEntityType } from '@dude/sync';
import type { SyncRecord } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { transaction } from '@dude/sqlite-store';
import { insertConflict } from '../store/repos/sync-conflicts.repo.js';
import { applyRemoteChanges, dropOp, getOp, toAppliedChange } from './apply-remote.js';
import type { AppliedChange, SyncApplyContext } from './apply-remote.js';
import { entityKeyOfKv, readLocal, removeLocal } from './sync-entities.js';

export const snapshotKey = (entityType: string, entityId: string): string => `${entityType}\u0000${entityId}`;

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
  for (const r of records) collector.seen.add(snapshotKey(r.entityType, r.entityId));
  collector.applied.push(...result.applied);
  collector.deferred.push(...result.deferred);
  collector.conflicts += result.conflicts;
}

interface SyncedKey { entityType: string; entityId: string; hubRevision: number }

/** Every local sync-entity the Hub has acknowledged as live (a hub revision and, for kv keys, a non-tombstone base). */
function localSyncedKeys(db: Db): SyncedKey[] {
  const keys: SyncedKey[] = [];
  const marks = SYNC_ENTITY_TYPES.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT entity_type, entity_id, hub_revision FROM records WHERE hub_revision IS NOT NULL AND entity_type IN (${marks})`)
    .all(...SYNC_ENTITY_TYPES) as unknown as Array<{ entity_type: string; entity_id: string; hub_revision: number }>;
  for (const r of rows) keys.push({ entityType: r.entity_type, entityId: r.entity_id, hubRevision: Number(r.hub_revision) });
  const kvRows = db.prepare('SELECT s.namespace, s.key, s.hub_revision FROM kv_sync s JOIN kv ON kv.namespace = s.namespace AND kv.key = s.key WHERE s.hub_revision IS NOT NULL AND s.base_json IS NOT NULL')
    .all() as unknown as Array<{ namespace: string; key: string; hub_revision: number }>;
  for (const r of kvRows) {
    const k = entityKeyOfKv(r.namespace, r.key);
    if (isSyncEntityType(k.entityType)) keys.push({ ...k, hubRevision: Number(r.hub_revision) });
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
 * Thrown when a snapshot shows the Hub's history regressed (PD-073): a local entity the Hub acknowledged at a revision above the
 * snapshot's `asOfRevision`. Nothing was changed; the caller raises the reconcile flag instead of deleting anything.
 */
export class HistoryRegressedError extends Error {
  constructor(readonly maxRevision: number, readonly asOfRevision: number) {
    super(`The Hub's history is behind this device (acknowledged revision ${maxRevision}, snapshot as of ${asOfRevision}).`);
  }
}

export interface SnapshotDeletionPlan {
  /** Acknowledged local entities (in enabled categories) that the snapshot does not contain. */
  missing: SyncedKey[];
  /** The highest acknowledged revision among them (0 when none). */
  maxRevision: number;
}

/** What `finishSnapshot` would delete, without touching anything. */
export function planSnapshotDeletions(db: Db, seen: ReadonlySet<string>, includeType: (entityType: string) => boolean = () => true): SnapshotDeletionPlan {
  const missing: SyncedKey[] = [];
  let maxRevision = 0;
  for (const key of localSyncedKeys(db)) {
    if (!includeType(key.entityType) || seen.has(snapshotKey(key.entityType, key.entityId))) continue;
    if (!readLocal(db, key.entityType, key.entityId).exists) continue;
    missing.push(key);
    maxRevision = Math.max(maxRevision, key.hubRevision);
  }
  return { missing, maxRevision };
}

export interface FinishSnapshotOptions {
  /**
   * The snapshot's `asOfRevision`. When given, an acknowledged local entity above it means the Hub regressed and
   * `HistoryRegressedError` is thrown before anything is deleted or changed.
   */
  asOfRevision?: number;
}

/**
 * Last step of a snapshot: a local entity the Hub had acknowledged but the snapshot does not contain was deleted on
 * the Hub. With a pending edit it is an edit-delete conflict (the Hub state, deletion, wins locally); otherwise it is
 * deleted locally. Never-synced entities (no hub revision) are untouched and their ops stay pending. The caller takes the
 * recovery snapshot first (a VACUUM cannot run inside this transaction).
 */
export function finishSnapshot(
  db: Db, collector: SnapshotCollector, ctx: SyncApplyContext,
  /** Restricts which entity types may be deleted locally (a disabled category's rows are never touched). */
  includeType: (entityType: string) => boolean = () => true,
  options: FinishSnapshotOptions = {},
): SnapshotResult {
  const result: SnapshotResult = { applied: collector.applied, deferred: collector.deferred, conflicts: collector.conflicts, deletedLocally: 0 };
  transaction(db, () => {
    const { missing, maxRevision } = planSnapshotDeletions(db, collector.seen, includeType);
    if (options.asOfRevision !== undefined && maxRevision > options.asOfRevision) throw new HistoryRegressedError(maxRevision, options.asOfRevision);
    for (const { entityType, entityId } of missing) {
      const local = readLocal(db, entityType, entityId);
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
