import { ENTITY_CODECS, isKnownEntityType } from '@dude/persistence';
import { OUTBOX_MAX_ROWS, coalesceOutbox } from '@dude/sync';
import type { OutboxOp } from '@dude/sync';
import type { EntityCommit, EntityCommitResult } from '@dude/contracts';
import type { Db } from './sqlite.js';
import { transaction } from './sqlite.js';
import { rowToOp } from './repos/outbox.repo.js';
import type { OutboxRow } from './repos/outbox.repo.js';
import { outboxCount } from './repos/outbox.repo.js';

export interface CommitContext {
  deviceId: string;
  environmentId: string;
  now: () => Date;
  newOpId: () => string;
  /** Outbox row ceiling; writes beyond it still succeed and report backpressure. Defaults to OUTBOX_MAX_ROWS. */
  maxOutboxRows?: number;
  /**
   * Per-entity-type codec contexts, for codecs whose `decode` needs host data (home-layout needs its panel
   * catalog and defaults). When a context-requiring type has none here, the payload gets only a minimal
   * structural check (a plain JSON object) and is stored as given; the renderer-side codec already sanitized it.
   */
  codecCtx?: Readonly<Record<string, unknown>>;
}

export type CommitOutcome = EntityCommitResult & { backpressure?: boolean };
export type ImportOutcome = { ok: true; count: number; backpressure: boolean } | { ok: false; error: string };

/** A rejected commit (unknown type, undecodable payload). SQL failures are not wrapped and propagate after rollback. */
class CommitRejected extends Error {}

const CTX_REQUIRED = new Set(['home-layout']);
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

interface RecordRow { local_revision: number; hub_revision: number | null; created_at: string }

function apply(db: Db, ctx: CommitContext, commit: EntityCommit): { localRevision: number; outboxOpId?: string } {
  if (!isKnownEntityType(commit.entityType)) throw new CommitRejected(`Unknown entity type "${commit.entityType}".`);
  const codec = ENTITY_CODECS[commit.entityType];
  const stamp = ctx.now().toISOString();
  const existing = db.prepare('SELECT local_revision, hub_revision, created_at FROM records WHERE entity_type = ? AND entity_id = ?')
    .get(commit.entityType, commit.entityId) as RecordRow | undefined;

  let encoded: unknown = null;
  if (commit.op === 'upsert') {
    const codecCtx = ctx.codecCtx?.[commit.entityType];
    let decoded: unknown;
    if (codecCtx === undefined && CTX_REQUIRED.has(commit.entityType)) {
      if (!isPlainObject(commit.payload)) throw new CommitRejected(`Invalid ${commit.entityType} payload.`);
      decoded = commit.payload;
    } else {
      decoded = codec.decode(commit.payload, codecCtx);
      if (decoded === null || decoded === undefined) throw new CommitRejected(`Invalid ${commit.entityType} payload.`);
      if (codec.idOf(decoded) !== commit.entityId) throw new CommitRejected(`Payload id does not match entity id "${commit.entityId}".`);
    }
    encoded = CTX_REQUIRED.has(commit.entityType) && codecCtx === undefined ? decoded : codec.encode(decoded);
  } else if (!existing) {
    return { localRevision: 0 };
  }

  const localRevision = (existing?.local_revision ?? 0) + 1;
  if (commit.op === 'upsert') {
    db.prepare(
      `INSERT INTO records(entity_type, entity_id, environment_id, scope, schema_version, local_revision, hub_revision, payload_json, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET
         scope = excluded.scope, schema_version = excluded.schema_version, local_revision = excluded.local_revision,
         payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
    ).run(commit.entityType, commit.entityId, ctx.environmentId, codec.scope, codec.schemaVersion, localRevision, JSON.stringify(encoded), stamp, stamp);
  } else {
    db.prepare('DELETE FROM records WHERE entity_type = ? AND entity_id = ?').run(commit.entityType, commit.entityId);
  }

  if (!codec.journaled) return { localRevision };

  const prevRow = db.prepare('SELECT * FROM outbox WHERE entity_type = ? AND entity_id = ?').get(commit.entityType, commit.entityId) as unknown as OutboxRow | undefined;
  const next: OutboxOp = {
    opId: ctx.newOpId(),
    environmentId: ctx.environmentId,
    deviceId: ctx.deviceId,
    entityType: commit.entityType,
    entityId: commit.entityId,
    opKind: commit.op,
    schemaVersion: codec.schemaVersion,
    basedOnRevision: existing?.hub_revision ?? null,
    localRevision,
    payload: commit.op === 'upsert' ? encoded : null,
    status: 'unsent-standalone',
    createdAt: stamp,
    updatedAt: stamp,
  };
  const merged = coalesceOutbox(prevRow ? rowToOp(prevRow) : undefined, next);
  if (merged === null) {
    db.prepare('DELETE FROM outbox WHERE entity_type = ? AND entity_id = ?').run(commit.entityType, commit.entityId);
    return { localRevision };
  }
  db.prepare(
    `INSERT INTO outbox(op_id, entity_type, entity_id, environment_id, device_id, op_kind, schema_version, based_on_revision, local_revision, payload_json, status, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET
       op_id = excluded.op_id, environment_id = excluded.environment_id, device_id = excluded.device_id, op_kind = excluded.op_kind,
       schema_version = excluded.schema_version, based_on_revision = excluded.based_on_revision, local_revision = excluded.local_revision,
       payload_json = excluded.payload_json, status = excluded.status, created_at = excluded.created_at, updated_at = excluded.updated_at`,
  ).run(
    merged.opId, merged.entityType, merged.entityId, merged.environmentId, merged.deviceId, merged.opKind, merged.schemaVersion,
    merged.basedOnRevision, merged.localRevision, merged.payload === null ? null : JSON.stringify(merged.payload), merged.status, merged.createdAt, merged.updatedAt,
  );
  return { localRevision, outboxOpId: merged.opId };
}

const overLimit = (db: Db, ctx: CommitContext): boolean => outboxCount(db) >= (ctx.maxOutboxRows ?? OUTBOX_MAX_ROWS);

/** Commit one entity change: row plus its coalesced outbox op in a single transaction. */
export function commitEntity(db: Db, ctx: CommitContext, commit: EntityCommit): CommitOutcome {
  try {
    return transaction(db, () => {
      const result = apply(db, ctx, commit);
      return { ok: true as const, ...result, backpressure: overLimit(db, ctx) };
    });
  } catch (error) {
    if (error instanceof CommitRejected) return { ok: false, error: error.message };
    throw error;
  }
}

/** Apply many commits in one transaction; any rejection rolls back the whole import. */
export function importMany(db: Db, ctx: CommitContext, commits: readonly EntityCommit[]): ImportOutcome {
  try {
    return transaction(db, () => {
      for (const commit of commits) apply(db, ctx, commit);
      return { ok: true as const, count: commits.length, backpressure: overLimit(db, ctx) };
    });
  } catch (error) {
    if (error instanceof CommitRejected) return { ok: false, error: error.message };
    throw error;
  }
}

export interface StoredRecord {
  entityType: string;
  entityId: string;
  payload: unknown;
  localRevision: number;
  hubRevision: number | null;
}

export function listRecords(db: Db, entityType?: string): StoredRecord[] {
  const sql = 'SELECT entity_type, entity_id, local_revision, hub_revision, payload_json FROM records'
    + (entityType === undefined ? '' : ' WHERE entity_type = ?') + ' ORDER BY entity_type, entity_id';
  const rows = (entityType === undefined ? db.prepare(sql).all() : db.prepare(sql).all(entityType)) as unknown as Array<{
    entity_type: string; entity_id: string; local_revision: number; hub_revision: number | null; payload_json: string;
  }>;
  return rows.map((r) => ({
    entityType: r.entity_type, entityId: r.entity_id, payload: JSON.parse(r.payload_json),
    localRevision: r.local_revision, hubRevision: r.hub_revision,
  }));
}
