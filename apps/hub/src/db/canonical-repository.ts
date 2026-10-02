import { ENTITY_CODECS } from '@dude/persistence';
import type { CommitResult, EntityCodec, EntityCollectionRepository } from '@dude/persistence';
import { allRows, getRow, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';

export type CanonicalRejectionCode = 'unknown-entity' | 'non-canonical-scope' | 'invalid-payload' | 'unknown-environment';

/** A commit refused before anything was written. SQL failures are not wrapped; they propagate after rollback. */
export class CanonicalRejection extends Error {
  constructor(readonly code: CanonicalRejectionCode, message: string) {
    super(message);
    this.name = 'CanonicalRejection';
  }
}

export interface CanonicalCommit {
  environmentId: string;
  entityType: string;
  entityId: string;
  op: 'upsert' | 'delete';
  payload?: unknown;
  /** Idempotency key. A repeated opId returns the recorded revision and changes nothing. */
  opId?: string;
  deviceId?: string | null;
  now: string;
  /** Codec context for codecs whose `decode` needs host data (home-layout). */
  codecCtx?: unknown;
  /** Test seam: codec lookup (defaults to ENTITY_CODECS). */
  codecs?: Readonly<Record<string, EntityCodec<any, any>>>;
}

export type CanonicalCommitResult = { status: 'applied'; revision: number } | { status: 'duplicate'; revision: number };

export interface CanonicalRecord {
  environmentId: string;
  entityType: string;
  entityId: string;
  scope: string;
  schemaVersion: number;
  revision: number;
  /** Decoded payload; undefined for tombstones. */
  payload: unknown;
  deleted: boolean;
  updatedAt: string;
  updatedByDeviceId: string | null;
}

export interface CanonicalChange {
  revision: number;
  environmentId: string;
  entityType: string;
  entityId: string;
  op: 'upsert' | 'delete';
  deviceId: string | null;
  opId: string | null;
  at: string;
}

const CANONICAL_SCOPES = new Set(['environment', 'workspace']);
const CTX_REQUIRED = new Set(['home-layout']);
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

interface RecordRow {
  environment_id: string; entity_type: string; entity_id: string; scope: string; schema_version: number; revision: number;
  payload_json: string | null; deleted: number; updated_at: string; updated_by_device_id: string | null;
}

function toRecord(row: RecordRow): CanonicalRecord {
  return {
    environmentId: row.environment_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    scope: row.scope,
    schemaVersion: row.schema_version,
    revision: row.revision,
    payload: row.payload_json === null ? undefined : JSON.parse(row.payload_json),
    deleted: row.deleted === 1,
    updatedAt: row.updated_at,
    updatedByDeviceId: row.updated_by_device_id,
  };
}

export function currentRevision(db: Db): number {
  return getRow<{ r: number }>(db.prepare('SELECT COALESCE(MAX(revision), 0) AS r FROM change_feed'))?.r ?? 0;
}

/**
 * Commit one canonical mutation, its change-feed entry and its applied-op marker atomically.
 * The Hub is the only caller; revisions are global and monotonic.
 */
export function commitCanonical(db: Db, input: CanonicalCommit): CanonicalCommitResult {
  return transaction(db, (): CanonicalCommitResult => {
    if (input.opId !== undefined) {
      const seen = getRow<{ revision: number }>(db.prepare('SELECT revision FROM applied_ops WHERE op_id = ?'), input.opId);
      if (seen) return { status: 'duplicate', revision: seen.revision };
    }

    const codecs = input.codecs ?? ENTITY_CODECS;
    const codec = Object.hasOwn(codecs, input.entityType) ? codecs[input.entityType] : undefined;
    if (!codec) throw new CanonicalRejection('unknown-entity', `Unknown entity type "${input.entityType}".`);
    if (!CANONICAL_SCOPES.has(codec.scope)) {
      throw new CanonicalRejection('non-canonical-scope', `Entity type "${input.entityType}" has scope "${codec.scope}" and is never canonical.`);
    }
    if (!getRow(db.prepare('SELECT 1 AS x FROM environment WHERE environment_id = ?'), input.environmentId)) {
      throw new CanonicalRejection('unknown-environment', `Unknown environment "${input.environmentId}".`);
    }

    let payloadJson: string | null = null;
    if (input.op === 'upsert') {
      let encoded: unknown;
      if (input.codecCtx === undefined && CTX_REQUIRED.has(input.entityType)) {
        // Context-requiring codec without context: structural check only (the producing device already sanitized it).
        if (!isPlainObject(input.payload)) throw new CanonicalRejection('invalid-payload', `Invalid ${input.entityType} payload.`);
        encoded = input.payload;
      } else {
        const decoded: unknown = codec.decode(input.payload, input.codecCtx);
        if (decoded === null || decoded === undefined) throw new CanonicalRejection('invalid-payload', `Invalid ${input.entityType} payload.`);
        if (codec.idOf(decoded) !== input.entityId) throw new CanonicalRejection('invalid-payload', `Payload id does not match entity id "${input.entityId}".`);
        encoded = codec.encode(decoded);
      }
      payloadJson = JSON.stringify(encoded);
    }

    const revision = currentRevision(db) + 1;
    const deviceId = input.deviceId ?? null;
    db.prepare(
      `INSERT INTO records(environment_id, entity_type, entity_id, scope, schema_version, revision, payload_json, deleted, updated_at, updated_by_device_id)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(environment_id, entity_type, entity_id) DO UPDATE SET
         scope = excluded.scope, schema_version = excluded.schema_version, revision = excluded.revision, payload_json = excluded.payload_json,
         deleted = excluded.deleted, updated_at = excluded.updated_at, updated_by_device_id = excluded.updated_by_device_id`,
    ).run(input.environmentId, input.entityType, input.entityId, codec.scope, codec.schemaVersion, revision, payloadJson,
      input.op === 'delete' ? 1 : 0, input.now, deviceId);
    db.prepare('INSERT INTO change_feed(revision, environment_id, entity_type, entity_id, op, device_id, op_id, at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
      .run(revision, input.environmentId, input.entityType, input.entityId, input.op, deviceId, input.opId ?? null, input.now);
    if (input.opId !== undefined) {
      db.prepare('INSERT INTO applied_ops(op_id, revision, device_id, applied_at) VALUES(?, ?, ?, ?)').run(input.opId, revision, deviceId, input.now);
    }
    return { status: 'applied', revision };
  });
}

export function getCanonicalRecord(db: Db, environmentId: string, entityType: string, entityId: string): CanonicalRecord | undefined {
  const row = getRow<RecordRow>(
    db.prepare('SELECT * FROM records WHERE environment_id = ? AND entity_type = ? AND entity_id = ?'), environmentId, entityType, entityId);
  return row ? toRecord(row) : undefined;
}

export function listCanonicalRecords(db: Db, environmentId: string, entityType: string, options: { includeDeleted?: boolean } = {}): CanonicalRecord[] {
  const rows = allRows<RecordRow>(
    db.prepare(`SELECT * FROM records WHERE environment_id = ? AND entity_type = ?${options.includeDeleted ? '' : ' AND deleted = 0'} ORDER BY entity_id`),
    environmentId, entityType);
  return rows.map(toRecord);
}

/** Change-feed entries for an environment with revision > `afterRevision`, oldest first, at most `limit`. */
export function changesSince(db: Db, environmentId: string, afterRevision: number, limit: number): CanonicalChange[] {
  const rows = allRows<{
    revision: number; environment_id: string; entity_type: string; entity_id: string; op: 'upsert' | 'delete';
    device_id: string | null; op_id: string | null; at: string;
  }>(
    db.prepare('SELECT * FROM change_feed WHERE environment_id = ? AND revision > ? ORDER BY revision LIMIT ?'),
    environmentId, afterRevision, Math.max(0, Math.floor(limit)));
  return rows.map((r) => ({
    revision: r.revision, environmentId: r.environment_id, entityType: r.entity_type, entityId: r.entity_id, op: r.op,
    deviceId: r.device_id, opId: r.op_id, at: r.at,
  }));
}

/**
 * `EntityCollectionRepository` over canonical records. `CommitResult.localRevision` carries the global Hub revision.
 * Removing an absent entity is a no-op that reports the current revision (the port's contract); the repository
 * itself would record a tombstone. `importMany` commits every value in one transaction and returns the last revision.
 */
export function canonicalCollection<T extends { id: string }>(
  db: Db, environmentId: string, entityType: string, clock: () => Date,
  options: { codecs?: CanonicalCommit['codecs']; codecCtx?: unknown; deviceId?: string | null } = {},
): EntityCollectionRepository<T> {
  const base = { environmentId, entityType, codecs: options.codecs, codecCtx: options.codecCtx, deviceId: options.deviceId };
  const upsert = (value: T): number => commitCanonical(db, {
    ...base, entityId: value.id, op: 'upsert', payload: value, now: clock().toISOString(),
  }).revision;
  return {
    // async so a rejection surfaces as a rejected promise, never a synchronous throw
    list: async () => listCanonicalRecords(db, environmentId, entityType).map((r) => r.payload as T),
    get: async (id) => {
      const rec = getCanonicalRecord(db, environmentId, entityType, id);
      return rec && !rec.deleted ? (rec.payload as T) : undefined;
    },
    upsert: async (value): Promise<CommitResult> => ({ localRevision: upsert(value) }),
    remove: async (id): Promise<CommitResult> => {
      const rec = getCanonicalRecord(db, environmentId, entityType, id);
      if (!rec || rec.deleted) return { localRevision: currentRevision(db) };
      return { localRevision: commitCanonical(db, { ...base, entityId: id, op: 'delete', now: clock().toISOString() }).revision };
    },
    importMany: async (values): Promise<CommitResult> => ({
      localRevision: transaction(db, () => values.reduce((_, v) => upsert(v), currentRevision(db))),
    }),
  };
}
