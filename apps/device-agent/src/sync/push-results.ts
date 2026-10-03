import { SYNC_LIMITS } from '@dude/sync';
import type { SyncCategory } from '@dude/sync';
import type { SyncOp, SyncOpResult } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { transaction } from '@dude/sqlite-store';
import { deleteIfUnchanged, listSendable, markAttempt, markQuarantined } from '../store/repos/outbox.repo.js';
import { getOp, reconcileRemote } from './apply-remote.js';
import type { AppliedChange, SyncApplyContext } from './apply-remote.js';
import { readLocal, setBase } from './sync-entities.js';

export interface SentOp {
  opId: string;
  entityType: string;
  entityId: string;
  /** The outbox row's `updated_at` when it was sent; the op is only deleted if it still has it. */
  updatedAt: string;
  /** The payload that was sent: the Hub's new base on success. */
  payload: unknown | null;
}

export interface PushBatch {
  ops: SyncOp[];
  sent: SentOp[];
  /** Ops quarantined locally as 'too-large' while building. */
  quarantined: number;
}

export interface PushLimits {
  maxPushOps: number;
  maxPushBytes: number;
  maxRecordBytes: number;
}

const byteLength = (value: unknown): number => (value === null ? 0 : Buffer.byteLength(JSON.stringify(value), 'utf8'));

/** The next batch of sendable ops, within the op and byte limits. Nothing is sent before the first sync is done. */
export function buildPushBatch(
  db: Db,
  enabledCategories: Readonly<Record<SyncCategory, boolean>>,
  firstSyncDone: boolean,
  now: () => Date = () => new Date(),
  limits: PushLimits = SYNC_LIMITS,
): PushBatch {
  const batch: PushBatch = { ops: [], sent: [], quarantined: 0 };
  if (!firstSyncDone) return batch;
  transaction(db, () => {
    let bytes = 0;
    for (const op of listSendable(db, enabledCategories, limits.maxPushOps)) {
      const size = byteLength(op.payload);
      if (size > limits.maxRecordBytes) {
        markQuarantined(db, op.opId, 'too-large');
        batch.quarantined += 1;
        continue;
      }
      if (batch.ops.length > 0 && bytes + size > limits.maxPushBytes) break;
      bytes += size;
      batch.ops.push({
        opId: op.opId, entityType: op.entityType, entityId: op.entityId, opKind: op.opKind, schemaVersion: op.schemaVersion,
        basedOnRevision: op.basedOnRevision, payload: op.payload,
      });
      batch.sent.push({ opId: op.opId, entityType: op.entityType, entityId: op.entityId, updatedAt: op.updatedAt, payload: op.payload });
      markAttempt(db, op.opId, now().toISOString());
    }
  });
  return batch;
}

export interface PushApplyResult {
  applied: AppliedChange[];
  conflicts: number;
  quarantined: number;
}

/** Applies the Hub's per-op results for a batch built by `buildPushBatch`. */
export function applyPushResults(db: Db, sent: readonly SentOp[], results: readonly SyncOpResult[], ctx: SyncApplyContext): PushApplyResult {
  const out: PushApplyResult = { applied: [], conflicts: 0, quarantined: 0 };
  const byId = new Map(sent.map((s) => [s.opId, s]));
  transaction(db, () => {
    for (const result of results) {
      const op = byId.get(result.opId);
      if (!op) continue;
      if (result.status === 'applied' || result.status === 'duplicate') {
        const local = readLocal(db, op.entityType, op.entityId);
        if (local.hubRevision === null || local.hubRevision < result.revision) setBase(db, op.entityType, op.entityId, result.revision, op.payload);
        if (!deleteIfUnchanged(db, op.opId, op.updatedAt)) {
          // Edited (or coalesced) after the send: it stays, now based on what the Hub holds.
          const current = getOp(db, op.entityType, op.entityId);
          if (current && current.opId !== op.opId) {
            db.prepare('UPDATE outbox SET based_on_revision = ? WHERE op_id = ?').run(result.revision, current.opId);
          }
        }
      } else if (result.status === 'conflict') {
        const outcome = reconcileRemote(db, result.current, ctx, true);
        if (outcome.change) out.applied.push(outcome.change);
        if (outcome.conflict) out.conflicts += 1;
      } else if (markQuarantined(db, op.opId, result.reason)) {
        out.quarantined += 1;
      }
    }
  });
  return out;
}
