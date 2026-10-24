import { collabKindForEntity, parseCollabDocKey } from '@dude/collab-doc';
import type { SyncRecord, SyncRejectReason } from '@dude/contracts/hub';
import { ENTITY_CODECS, isSyncableSettingKey, settingCodec } from '@dude/persistence';
import type { CommitResult, EntityCodec, EntityCollectionRepository, SyncableToolInfo } from '@dude/persistence';
import { allRows, getRow, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { syncPolicyFor, SYNC_LIMITS } from '@dude/sync';
import { TOOL_METADATA } from '@dude/tool-registry';
import { toSyncRecord } from './sync-repository.js';
import type { RecordRow } from './sync-repository.js';

export type CanonicalRejectionCode =
  | 'unknown-entity' | 'non-canonical-scope' | 'invalid-payload' | 'unknown-environment'
  | 'too-large' | 'unknown-setting' | 'not-owner-device' | 'schema-too-new';

const REJECT_REASONS: Partial<Record<CanonicalRejectionCode, SyncRejectReason>> = {
  'unknown-entity': 'unknown-entity', 'non-canonical-scope': 'non-syncable-scope', 'invalid-payload': 'invalid-payload',
  'too-large': 'too-large', 'unknown-setting': 'unknown-setting', 'not-owner-device': 'not-owner-device', 'schema-too-new': 'schema-too-new',
};

/** Codecs the Hub validates against: the shared registry plus the synced kv `setting` entity. */
const HUB_CODECS: Readonly<Record<string, EntityCodec<any, any>>> = { ...ENTITY_CODECS, [settingCodec.entityType]: settingCodec };

/** A commit refused before anything was written. SQL failures are not wrapped; they propagate after rollback. */
export class CanonicalRejection extends Error {
  constructor(readonly code: CanonicalRejectionCode, message: string) {
    super(message);
    this.name = 'CanonicalRejection';
  }
}

/**
 * The authenticated actor of a device or browser push re-verified INSIDE the commit transaction (defense in depth: a
 * revocation that committed between authentication and this write must still win). Maps to HTTP 401 at the route.
 */
export type CommitActor =
  | { kind: 'device'; deviceId: string; keyId: string }
  | { kind: 'browser'; deviceId: string; sessionHash: string };

/** The acting device or session ended before the write could land; nothing was written. */
export class DeviceInactiveError extends Error {
  constructor() {
    super('The acting device or session is no longer active.');
    this.name = 'DeviceInactiveError';
  }
}

/** One indexed lookup per commit: device active (not revoked/unenrolled), key not revoked; or session live and browser row active. */
function assertActorActive(db: Db, actor: CommitActor): void {
  const row = actor.kind === 'device'
    ? getRow(db.prepare(
      `SELECT 1 AS x FROM device_keys k JOIN devices d ON d.device_id = k.device_id
       WHERE k.key_id = ? AND k.device_id = ? AND k.revoked_at IS NULL AND d.kind = 'desktop' AND d.revoked_at IS NULL AND d.unenrolled_at IS NULL`), actor.keyId, actor.deviceId)
    : getRow(db.prepare(
      `SELECT 1 AS x FROM sessions s JOIN devices d ON d.device_id = s.browser_device_id
       WHERE s.session_hash = ? AND s.browser_device_id = ? AND s.revoked_at IS NULL AND d.kind = 'browser' AND d.revoked_at IS NULL AND d.unenrolled_at IS NULL`), actor.sessionHash, actor.deviceId);
  if (!row) throw new DeviceInactiveError();
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
  /** Sync routes only: enforce SYNC_POLICIES (conflict policy, ownership, size, schema version, setting keys). */
  enforcePolicy?: boolean;
  /** Revision the producing device last saw for this entity (merge3 conflict detection). */
  basedOnRevision?: number | null;
  /** Sync and web pushes: re-verified inside the commit transaction before anything else. */
  actor?: CommitActor;
  /** The authenticated device; per-device entities must be owned by it. */
  actingDeviceId?: string;
  /** Schema version the producing device wrote the payload with (enforcePolicy only). */
  schemaVersion?: number;
  /** Test seam: tool manifests for the setting-key check (defaults to the generated registry). */
  tools?: readonly SyncableToolInfo[];
  /**
   * PD-102, sync and web pushes of a client that declared `accept: ['merged']`: given an upsert of a collaborative record based on an
   * older revision, returns the merged payload (or undefined for "no clean merge", which stays a conflict). The repository itself knows
   * nothing about Yjs; the callback is supplied by `collab/record-merge.ts`. It runs INSIDE the commit transaction, so it must only read
   * and compute; whatever must happen to the live document is registered through `defer`.
   */
  collabMerge?: CollabMerge;
  /**
   * PD-102: the live document of this collaborative record could not be written into the record before this write was evaluated, so the
   * record is behind it. An upsert is then never applied over it, even when it is based on the current revision: it merges (when
   * `collabMerge` is supplied) or conflicts.
   */
  collabDiverged?: boolean;
  /** Called once, after the transaction, when an upsert was applied: the live document takes the committed payload (PD-102). Never throws into the commit. */
  collabApplied?: (revision: number) => void;
}

/** What a merge callback is asked: the writer's edit, the record it was based on and the record as it stands. */
export interface CollabMergeRequest {
  entityType: string;
  entityId: string;
  basedOnRevision: number;
  /** The incoming payload as the codec stores it. */
  incoming: unknown;
  /** The live record (never a tombstone). */
  current: { revision: number; payload: unknown };
  deviceId: string | null;
  /** Largest merged payload the commit will accept, in UTF-8 bytes. */
  maxBytes: number;
}

/**
 * Registers `fn` to run once, after the transaction ended: with the new revision when the merged payload was committed, with null when it
 * was not (no merge, a rejected merge, a thrown error). Used to apply the merge to the live document and to release what the callback opened.
 */
export type CollabMergeDefer = (fn: (committedRevision: number | null) => void) => void;
export type CollabMerge = (request: CollabMergeRequest, defer: CollabMergeDefer) => unknown | undefined;

export type CanonicalCommitResult = { status: 'applied'; revision: number } | { status: 'duplicate'; revision: number };
export type SyncCommitResult =
  | CanonicalCommitResult
  | { status: 'conflict'; current: SyncRecord }
  | { status: 'merged'; revision: number; current: SyncRecord }
  | { status: 'rejected'; reason: SyncRejectReason };

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
  // Compaction can delete every change-feed row, so the compaction floor is a lower bound: revisions never restart.
  const feed = getRow<{ r: number }>(db.prepare('SELECT COALESCE(MAX(revision), 0) AS r FROM change_feed'))?.r ?? 0;
  const floor = Number(getRow<{ value: string }>(db.prepare("SELECT value FROM meta WHERE key = 'sync_floor'"))?.value ?? 0);
  return Math.max(feed, Number.isFinite(floor) ? floor : 0);
}

/**
 * Commit one canonical mutation, its change-feed entry and its applied-op marker atomically.
 * The Hub is the only caller; revisions are global and monotonic.
 */
export function commitCanonical(db: Db, input: CanonicalCommit & { enforcePolicy: true }): SyncCommitResult;
export function commitCanonical(db: Db, input: CanonicalCommit): CanonicalCommitResult;
export function commitCanonical(db: Db, input: CanonicalCommit): SyncCommitResult {
  const deferred: Array<(committedRevision: number | null) => void> = [];
  const runDeferred = (revision: number | null): void => {
    for (const fn of deferred.splice(0)) {
      try { fn(revision); } catch { /* applying a merge to the live document never fails a commit that already landed */ }
    }
  };
  let result: SyncCommitResult;
  try {
    result = commitGuarded(db, input, deferred);
  } catch (error) {
    runDeferred(null);
    throw error;
  }
  // After the commit: the live document learns the merged text only once the record holds it.
  runDeferred(result.status === 'merged' ? result.revision : null);
  if (result.status === 'applied' && input.op === 'upsert' && input.collabApplied) {
    try { input.collabApplied(result.revision); } catch { /* the record is committed; the live document is caught up by the next push or edit */ }
  }
  if (result.status === 'applied' || result.status === 'merged') notifyObservers(db, input, result.revision);
  return result;
}

function commitGuarded(db: Db, input: CanonicalCommit, deferred: Array<(committedRevision: number | null) => void>): SyncCommitResult {
  if (!input.enforcePolicy) return commitInTransaction(db, input, deferred);
  try {
    return commitInTransaction(db, input, deferred);
  } catch (error) {
    const reason = error instanceof CanonicalRejection ? REJECT_REASONS[error.code] : undefined;
    if (reason) return { status: 'rejected', reason };
    throw error;
  }
}

export interface CanonicalCommitEvent {
  environmentId: string;
  entityType: string;
  entityId: string;
  op: 'upsert' | 'delete';
  revision: number;
}

const observers = new WeakMap<Db, Set<(event: CanonicalCommitEvent) => void>>();

/**
 * Observes every applied commit on `db` (not duplicates, conflicts or rejections), synchronously after it is written. It may run while an
 * outer transaction (the environment clear) is still open, so an observer only does in-memory work or writes that may join that
 * transaction. An observer's failure never reaches the committer. Returns the unsubscribe function.
 */
export function observeCanonicalCommits(db: Db, listener: (event: CanonicalCommitEvent) => void): () => void {
  let set = observers.get(db);
  if (!set) {
    set = new Set();
    observers.set(db, set);
  }
  set.add(listener);
  return () => void set.delete(listener);
}

function notifyObservers(db: Db, input: CanonicalCommit, revision: number): void {
  const set = observers.get(db);
  if (!set || set.size === 0) return;
  const event: CanonicalCommitEvent = { environmentId: input.environmentId, entityType: input.entityType, entityId: input.entityId, op: input.op, revision };
  for (const listener of [...set]) {
    try { listener(event); } catch { /* observers never fail a commit */ }
  }
}

function commitInTransaction(db: Db, input: CanonicalCommit, deferred: Array<(committedRevision: number | null) => void>): SyncCommitResult {
  return transaction(db, (): SyncCommitResult => {
    if (input.actor) assertActorActive(db, input.actor);
    if (input.opId !== undefined) {
      const seen = getRow<{ revision: number }>(db.prepare('SELECT revision FROM applied_ops WHERE op_id = ?'), input.opId);
      if (seen) return answerDuplicate(db, input, seen.revision);
    }

    const codecs = input.codecs ?? HUB_CODECS;
    const codec = Object.hasOwn(codecs, input.entityType) ? codecs[input.entityType] : undefined;
    if (!codec) throw new CanonicalRejection('unknown-entity', `Unknown entity type "${input.entityType}".`);
    if (!CANONICAL_SCOPES.has(codec.scope)) {
      throw new CanonicalRejection('non-canonical-scope', `Entity type "${input.entityType}" has scope "${codec.scope}" and is never canonical.`);
    }
    if (!getRow(db.prepare('SELECT 1 AS x FROM environment WHERE environment_id = ?'), input.environmentId)) {
      throw new CanonicalRejection('unknown-environment', `Unknown environment "${input.environmentId}".`);
    }

    const policy = input.enforcePolicy ? syncPolicyFor(input.entityType) : undefined;
    if (input.enforcePolicy) {
      if (!policy) throw new CanonicalRejection('unknown-entity', `Entity type "${input.entityType}" does not sync.`);
      if (policy.conflict === 'per-device' && input.entityId !== input.actingDeviceId) {
        throw new CanonicalRejection('not-owner-device', 'A device may only write its own per-device record.');
      }
      if (input.op === 'upsert' && Buffer.byteLength(JSON.stringify(input.payload ?? null), 'utf8') > SYNC_LIMITS.maxRecordBytes) {
        throw new CanonicalRejection('too-large', 'Record exceeds the size limit.');
      }
      if (input.schemaVersion !== undefined && input.schemaVersion > codec.schemaVersion) {
        throw new CanonicalRejection('schema-too-new', 'The device wrote a newer schema than this Hub understands.');
      }
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
        if (policy?.conflict !== 'per-device' && codec.idOf(decoded) !== input.entityId) throw new CanonicalRejection('invalid-payload', `Payload id does not match entity id "${input.entityId}".`);
        encoded = codec.encode(decoded);
      }
      payloadJson = JSON.stringify(encoded);
    }

    if (input.enforcePolicy && input.entityType === settingCodec.entityType) {
      const payload = input.op === 'upsert' ? (JSON.parse(payloadJson as string) as { namespace: string; key: string }) : undefined;
      const sep = input.entityId.indexOf(':');
      const namespace = payload?.namespace ?? input.entityId.slice(0, Math.max(sep, 0));
      const key = payload?.key ?? input.entityId.slice(sep + 1);
      if (sep < 0 || !isSyncableSettingKey(namespace, key, input.tools ?? TOOL_METADATA)) {
        throw new CanonicalRejection('unknown-setting', 'This setting does not sync.');
      }
    }

    let merged = false;
    if (policy?.conflict === 'merge3') {
      const existing = getRow<RecordRow>(
        db.prepare('SELECT * FROM records WHERE environment_id = ? AND entity_type = ? AND entity_id = ?'),
        input.environmentId, input.entityType, input.entityId);
      if (existing && ((input.basedOnRevision ?? null) !== existing.revision
        || (input.collabDiverged === true && input.op === 'upsert' && existing.deleted === 0))) {
        // PD-102: a write to a collaborative record based on an older revision is merged three ways when the client can take the answer.
        const mergedJson = payloadJson === null ? undefined : mergeCollabEdit(input, existing, payloadJson, codec, deferred);
        if (mergedJson === undefined) return { status: 'conflict', current: toSyncRecord(existing) };
        payloadJson = mergedJson;
        merged = true;
      }
      if (!existing && input.op === 'upsert' && input.basedOnRevision !== null && input.basedOnRevision !== undefined) {
        // The device knew a revision of a record that no longer exists: its tombstone was compacted. Report it as the deletion it
        // was, so a stale edit never resurrects a deleted record.
        const floor = Number(getRow<{ value: string }>(db.prepare("SELECT value FROM meta WHERE key = 'sync_floor'"))?.value ?? 0);
        return {
          status: 'conflict',
          current: {
            entityType: input.entityType, entityId: input.entityId, revision: Math.max(floor, input.basedOnRevision), deleted: true, payload: null,
            schemaVersion: codec.schemaVersion, updatedAt: input.now, updatedByDeviceId: null,
          },
        };
      }
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
    if (input.op === 'delete') deleteCollabState(db, input.entityType, input.entityId);
    if (merged) {
      const row = getRow<RecordRow>(
        db.prepare('SELECT * FROM records WHERE environment_id = ? AND entity_type = ? AND entity_id = ?'),
        input.environmentId, input.entityType, input.entityId) as RecordRow;
      return { status: 'merged', revision, current: toSyncRecord(row) };
    }
    return { status: 'applied', revision };
  });
}

/**
 * Runs the merge callback for a collaborative record edited from an older revision. Returns the codec-encoded merged payload as JSON,
 * or undefined when there is nothing to merge with (no callback, not an upsert, a tombstone, no base, a field that does not merge, a
 * result over the size cap or one the codec refuses): the caller then reports the ordinary conflict.
 */
function mergeCollabEdit(
  input: CanonicalCommit, existing: RecordRow, incomingJson: string, codec: EntityCodec<any, any>,
  deferred: Array<(committedRevision: number | null) => void>,
): string | undefined {
  const basedOn = input.basedOnRevision;
  if (!input.collabMerge || input.op !== 'upsert' || existing.deleted === 1 || existing.payload_json === null) return undefined;
  if (typeof basedOn !== 'number' || basedOn > existing.revision || collabKindForEntity(input.entityType) === null) return undefined;
  const mergedPayload = input.collabMerge({
    entityType: input.entityType, entityId: input.entityId, basedOnRevision: basedOn, incoming: JSON.parse(incomingJson),
    current: { revision: existing.revision, payload: JSON.parse(existing.payload_json) }, deviceId: input.deviceId ?? null,
    maxBytes: SYNC_LIMITS.maxRecordBytes,
  }, (fn) => void deferred.push(fn));
  if (mergedPayload === undefined) return undefined;
  const decoded: unknown = codec.decode(mergedPayload, input.codecCtx);
  if (decoded === null || decoded === undefined || codec.idOf(decoded) !== input.entityId) return undefined;
  const json = JSON.stringify(codec.encode(decoded));
  return Buffer.byteLength(json, 'utf8') > SYNC_LIMITS.maxRecordBytes ? undefined : json;
}

/**
 * A repeated op id is answered `duplicate` with the recorded revision. The one exception keeps a retried merged push consistent for a
 * client that can take `merged`: the original answer carried the merged record, which the client may never have received. When the
 * record is still at the op's revision (nothing newer has landed) and differs from the payload the retry carries, that op was merged,
 * so the record is returned again.
 */
function answerDuplicate(db: Db, input: CanonicalCommit, revision: number): SyncCommitResult {
  if (!input.collabMerge || input.op !== 'upsert' || collabKindForEntity(input.entityType) === null) return { status: 'duplicate', revision };
  const row = getRow<RecordRow>(
    db.prepare('SELECT * FROM records WHERE environment_id = ? AND entity_type = ? AND entity_id = ?'),
    input.environmentId, input.entityType, input.entityId);
  if (!row || row.revision !== revision || row.deleted === 1 || row.payload_json === null) return { status: 'duplicate', revision };
  const codec = (input.codecs ?? HUB_CODECS)[input.entityType];
  let sent: string | undefined;
  try {
    const decoded: unknown = codec?.decode(input.payload, input.codecCtx);
    sent = decoded === null || decoded === undefined ? undefined : JSON.stringify(codec?.encode(decoded));
  } catch {
    sent = undefined;
  }
  return sent === undefined || sent === row.payload_json ? { status: 'duplicate', revision } : { status: 'merged', revision, current: toSyncRecord(row) };
}

/**
 * A tombstone ends the record's collaborative document (PD-101): its Yjs state, tail, snapshots and merge bases go in the same
 * transaction as the delete, so a crash can never leave a Y.Doc that outlives its record. Entity types that are not collaborative
 * (and ids that are not legal document keys) have none.
 */
function deleteCollabState(db: Db, entityType: string, entityId: string): void {
  const kind = collabKindForEntity(entityType);
  const ref = kind === null ? null : parseCollabDocKey(`${kind}:${entityId}`);
  if (!ref) return;
  const docKey = `${ref.kind}:${ref.id}`;
  for (const table of ['collab_updates', 'collab_snapshots', 'collab_bases', 'collab_docs']) {
    db.prepare(`DELETE FROM ${table} WHERE doc_key = ?`).run(docKey);
  }
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
