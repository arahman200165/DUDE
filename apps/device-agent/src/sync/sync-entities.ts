import { ENTITY_CODECS, SETTING_ENTITY_TYPE, findKvBindingForEntity, findKvEntityBinding, settingCodec } from '@dude/persistence';
import type { SyncRecord } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { transaction } from '@dude/sqlite-store';
import { applyRemoteKv, applyRemoteKvDelete } from '../store/repos/kv.repo.js';
import { getKvSync, setKvSync } from '../store/repos/kv-sync.repo.js';
import { applyRemoteDelete, applyRemoteRecord, setHubState } from '../store/repos/records.repo.js';

/** Where a sync entity lives locally: a `records` row, or a kv key (a `setting`, or a bound singleton). */
export type EntityStorage =
  | { kind: 'record' }
  | { kind: 'kv'; namespace: string; key: string; shape: 'setting' | 'bound' };

export interface LocalEntity {
  /** False when the row/key is absent locally. */
  exists: boolean;
  payload: unknown | null;
  deleted: boolean;
  hubRevision: number | null;
  /** The last Hub version (merge base); null when unknown or when the Hub version is a tombstone. */
  base: unknown | null;
}

export interface RemoteWriteContext {
  environmentId: string;
  now: () => Date;
}

/** Resolves the storage of an entity key; undefined for a malformed setting id. */
export function storageOf(entityType: string, entityId: string): EntityStorage | undefined {
  if (entityType === SETTING_ENTITY_TYPE) {
    const i = entityId.indexOf(':');
    if (i <= 0 || i === entityId.length - 1) return undefined;
    return { kind: 'kv', namespace: entityId.slice(0, i), key: entityId.slice(i + 1), shape: 'setting' };
  }
  const binding = findKvBindingForEntity(entityType, entityId);
  if (binding) return { kind: 'kv', namespace: binding.namespace, key: binding.key, shape: 'bound' };
  return { kind: 'record' };
}

/** The entity key a kv key syncs as, or undefined when it is not a bound singleton (then it is a `setting`). */
export function entityKeyOfKv(namespace: string, key: string): { entityType: string; entityId: string } {
  const binding = findKvEntityBinding(namespace, key);
  return binding ? { entityType: binding.entityType, entityId: binding.entityId } : { entityType: SETTING_ENTITY_TYPE, entityId: `${namespace}:${key}` };
}

/** Schema version this build understands for an entity type (0 when unknown). */
export function localSchemaVersion(entityType: string): number {
  if (entityType === SETTING_ENTITY_TYPE) return settingCodec.schemaVersion;
  return ENTITY_CODECS[entityType]?.schemaVersion ?? 0;
}

const kvPayload = (s: Extract<EntityStorage, { kind: 'kv' }>, value: unknown): unknown =>
  s.shape === 'setting' ? { namespace: s.namespace, key: s.key, value } : value;

export function readLocal(db: Db, entityType: string, entityId: string): LocalEntity {
  const s = storageOf(entityType, entityId);
  if (!s) return { exists: false, payload: null, deleted: true, hubRevision: null, base: null };
  if (s.kind === 'record') {
    const r = db.prepare('SELECT payload_json, hub_revision, hub_payload_json FROM records WHERE entity_type = ? AND entity_id = ?')
      .get(entityType, entityId) as unknown as { payload_json: string; hub_revision: number | null; hub_payload_json: string | null } | undefined;
    if (!r) return { exists: false, payload: null, deleted: true, hubRevision: null, base: null };
    return {
      exists: true, payload: JSON.parse(r.payload_json), deleted: false,
      hubRevision: r.hub_revision === null ? null : Number(r.hub_revision),
      base: r.hub_payload_json === null ? null : JSON.parse(r.hub_payload_json),
    };
  }
  const row = db.prepare('SELECT value_json FROM kv WHERE namespace = ? AND key = ?').get(s.namespace, s.key) as unknown as { value_json: string } | undefined;
  const sync = getKvSync(db, s.namespace, s.key);
  const hubRevision = sync?.hubRevision ?? null;
  const base = sync?.base ?? null;
  if (!row) return { exists: false, payload: null, deleted: true, hubRevision, base };
  return { exists: true, payload: kvPayload(s, JSON.parse(row.value_json)), deleted: false, hubRevision, base };
}

/**
 * Writes a Hub record locally WITHOUT journaling and records its revision/payload as the merge base. A tombstone deletes
 * the local row/key (a kv key keeps the tombstone revision in `kv_sync`). Returns false for a malformed setting id.
 */
export function applyRemote(db: Db, record: SyncRecord, ctx: RemoteWriteContext): boolean {
  const s = storageOf(record.entityType, record.entityId);
  if (!s) return false;
  transaction(db, () => {
    if (s.kind === 'record') {
      if (record.deleted || record.payload === null) applyRemoteDelete(db, record.entityType, record.entityId);
      else {
        applyRemoteRecord(db, {
          entityType: record.entityType, entityId: record.entityId, payload: record.payload, hubRevision: record.revision,
          environmentId: ctx.environmentId, now: ctx.now(), schemaVersion: record.schemaVersion,
        });
      }
      return;
    }
    if (record.deleted || record.payload === null) {
      applyRemoteKvDelete(db, s.namespace, s.key, record.revision);
      return;
    }
    const value = s.shape === 'setting' ? (record.payload as { value: unknown }).value : record.payload;
    applyRemoteKv(db, s.namespace, s.key, value, record.revision, record.payload, ctx.now());
  });
  return true;
}

/** Removes a local entity WITHOUT journaling and without any Hub bookkeeping (the Hub no longer has it). */
export function removeLocal(db: Db, entityType: string, entityId: string): void {
  const s = storageOf(entityType, entityId);
  if (!s) return;
  if (s.kind === 'record') applyRemoteDelete(db, entityType, entityId);
  else applyRemoteKvDelete(db, s.namespace, s.key, null);
}

/** Records the Hub revision and version (merge base) of an entity; a no-op for a record row that does not exist. */
export function setBase(db: Db, entityType: string, entityId: string, revision: number | null, payload: unknown | null): void {
  const s = storageOf(entityType, entityId);
  if (!s) return;
  if (s.kind === 'record') setHubState(db, entityType, entityId, revision, payload);
  else setKvSync(db, s.namespace, s.key, revision, payload);
}
