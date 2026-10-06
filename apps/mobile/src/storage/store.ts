import { favoriteCodec, type FavoriteItem } from '@dude/persistence/codecs/favorite.codec';
import { settingCodec, settingEntityId, type SettingEntity } from '@dude/persistence/codecs/setting.codec';
import type { EntityCodec } from '@dude/persistence/codecs/entity-codec';
import type { CommitResult, EntityCollectionRepository, KeyValueRepository, KvWriteMeta } from '@dude/persistence/repositories/ports';
import { findSettingDefinition } from '@dude/persistence/settings/core-setting-definitions';
import { createManifestScopeLookup, resolveKvScope } from '@dude/persistence/settings/kv-scope';
import { isSyncableSettingKey } from '@dude/persistence/settings/syncable-key';
import { coalesceOutbox } from '@dude/sync/outbox/coalesce';
import { OUTBOX_MAX_ROWS, type OutboxOp } from '@dude/sync/outbox/outbox-op.model';
import { categoryOf } from '@dude/sync/policies';
import { SYNC_LIMITS } from '@dude/sync/limits';
import type { SyncRecord } from '@dude/contracts/hub';
import type { MobileEnrollmentAttempt, MobileHubEnrollment, MobileHubPersistence } from '../hub/types';
import { migrateMobileDatabase } from './migrations';
import type { SqlConnection, SqlDatabase } from './sql';
import type { CategoryFlags, ClaimedOperation, MobileCategory, PushResults, RecoveryExport, RepairAuthority, SnapshotChoice, StagedSnapshot, StorageContext, StoredRecord, StoreOptions } from './types';

interface ContextRow { id: string; kind: StorageContext['kind']; environment_id: string; device_id: string; writable: number; local_revision: number; cursor: number; head: number; epoch: number; categories: string; consent: number }
interface RecordRow { entity_type: string; entity_id: string; payload: string | null; deleted: number; local_revision: number; hub_revision: number | null }
interface OutboxRow { op_id: string; body: string; claimed: number; rejected: string | null }
interface SnapshotRow { id: string; context_id: string; categories: string; cursor: number; head: number; epoch: number; local_revision: number; complete: number }
const decodeContext = (r: ContextRow): StorageContext => ({ id: r.id, kind: r.kind, environmentId: r.environment_id, deviceId: r.device_id, writable: !!r.writable, localRevision: r.local_revision, cursor: r.cursor, head: r.head, epoch: r.epoch, categories: JSON.parse(r.categories), consent: !!r.consent });
const decodeRecord = (r: RecordRow): StoredRecord => ({ entityType: r.entity_type, entityId: r.entity_id, payload: r.payload === null ? null : JSON.parse(r.payload), deleted: !!r.deleted, localRevision: r.local_revision, hubRevision: r.hub_revision });
const decodeOperation = (r: OutboxRow): ClaimedOperation => ({ ...JSON.parse(r.body), claimed: !!r.claimed, rejected: r.rejected });
const CATEGORIES: readonly MobileCategory[] = ['favorites', 'settings'];
function json(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Undefined values cannot be persisted.');
  return encoded;
}
function utf8Bytes(value: string): number { let size = 0; for (const character of value) { const code = character.codePointAt(0)!; size += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; } return size; }
function validCategories(categories: readonly MobileCategory[]): void {
  if (!categories.length || new Set(categories).size !== categories.length || categories.some(c => !CATEGORIES.includes(c))) throw new Error('Select favorites and/or settings.');
}
function receipt<T extends MobileEnrollmentAttempt | MobileHubEnrollment>(value: T, pending = false): T {
  // Whitelist the durable identity, never serialize arbitrary caller fields such as codes or session tokens.
  const common = { deviceId: value.deviceId, environmentId: value.environmentId, hubInstanceId: value.hubInstanceId, authorityEpoch: value.authorityEpoch,
    hubUrl: value.hubUrl, pins: [...value.pins], keyRef: value.keyRef, publicKey: value.publicKey, spkiActive: value.spkiActive, spkiNext: value.spkiNext, proxySpkis: [...value.proxySpkis] };
  if (!common.deviceId || !common.environmentId || !common.hubInstanceId || !common.keyRef || !Number.isSafeInteger(common.authorityEpoch) || common.authorityEpoch < 1 || !common.hubUrl.startsWith('https://')) throw new Error('Invalid enrollment identity.');
  const attempt = value as MobileEnrollmentAttempt; const enrollment = value as MobileHubEnrollment;
  return (pending ? { ...common, mode: attempt.mode, displayName: attempt.displayName, createdAt: attempt.createdAt } : { ...common, keyId: enrollment.keyId, registeredAt: enrollment.registeredAt }) as unknown as T;
}

/** Durable state owner. No network or credential bytes enter this database. */
export class MobileStore implements MobileHubPersistence {
  private readonly listeners = new Set<() => void>();
  private constructor(readonly database: SqlDatabase, private readonly options: StoreOptions) {}
  static async open(database: SqlDatabase, options: StoreOptions): Promise<MobileStore> {
    await migrateMobileDatabase(database);
    const store = new MobileStore(database, options);
    await database.exclusive(async tx => {
      if (!await tx.first('SELECT id FROM contexts WHERE kind=?', 'standalone')) {
        const id = options.id();
        await tx.run('INSERT INTO contexts(id,kind,environment_id,device_id,writable) VALUES(?,?,?,?,1)', id, 'standalone', id, options.deviceId);
        await store.meta(tx, 'active_context', id);
      }
      const storedDevice = await store.readMeta<string>(tx, 'install_device');
      if (!storedDevice) await store.meta(tx, 'install_device', options.deviceId);
      if (!await store.readMeta<string>(tx, 'install_id')) await store.meta(tx, 'install_id', options.id());
    });
    return store;
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  async installIdentity(): Promise<{ deviceId: string; installId: string }> {
    return { deviceId: (await this.readMeta<string>(this.database, 'install_device'))!, installId: (await this.readMeta<string>(this.database, 'install_id'))! };
  }
  private async write<T>(work: (tx: SqlConnection) => Promise<T>): Promise<T> {
    const result = await this.database.exclusive(work);
    this.listeners.forEach(listener => listener());
    return result;
  }
  private async meta(tx: SqlConnection, key: string, value: unknown): Promise<void> { await tx.run('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, json(value)); }
  private async readMeta<T>(tx: SqlConnection, key: string): Promise<T | null> { const row = await tx.first<{ value: string }>('SELECT value FROM metadata WHERE key=?', key); return row ? JSON.parse(row.value) as T : null; }
  async contexts(): Promise<StorageContext[]> { return (await this.database.all<ContextRow>('SELECT * FROM contexts ORDER BY rowid')).map(decodeContext); }
  async context(id: string, tx: SqlConnection = this.database): Promise<StorageContext> { const row = await tx.first<ContextRow>('SELECT * FROM contexts WHERE id=?', id); if (!row) throw new Error('Storage context does not exist.'); return decodeContext(row); }
  async activeContext(): Promise<StorageContext> { const id = await this.readMeta<string>(this.database, 'active_context'); if (!id) throw new Error('Active context is missing. Preserve storage and recover.'); return this.context(id); }
  async selectContext(id: string): Promise<void> { await this.write(async tx => { await this.context(id, tx); await this.meta(tx, 'active_context', id); }); }
  async listRecords(id: string, tx: SqlConnection = this.database): Promise<StoredRecord[]> { return (await tx.all<RecordRow>('SELECT * FROM records WHERE context_id=? ORDER BY entity_type,entity_id', id)).map(decodeRecord); }
  async pending(id: string, tx: SqlConnection = this.database): Promise<ClaimedOperation[]> { return (await tx.all<OutboxRow>('SELECT * FROM outbox WHERE context_id=? ORDER BY sequence', id)).map(decodeOperation); }
  async syncState(id: string): Promise<StorageContext> { return this.context(id); }
  private async writable(tx: SqlConnection, id: string): Promise<StorageContext> { const context = await this.context(id, tx); if (!context.writable || context.kind === 'archive') throw new Error('Cached environment is read-only. Re-pair or export it before editing.'); return context; }
  private async bump(tx: SqlConnection, id: string): Promise<number> { await tx.run('UPDATE contexts SET local_revision=local_revision+1 WHERE id=?', id); return (await this.context(id, tx)).localRevision; }
  private now(): string { return new Date(this.options.now()).toISOString(); }
  private async putRecord(tx: SqlConnection, id: string, type: string, entityId: string, payload: unknown, deleted: boolean, revision: number, hubRevision: number | null): Promise<void> {
    await tx.run('INSERT INTO records(context_id,entity_type,entity_id,payload,deleted,local_revision,hub_revision) VALUES(?,?,?,?,?,?,?) ON CONFLICT(context_id,entity_type,entity_id) DO UPDATE SET payload=excluded.payload,deleted=excluded.deleted,local_revision=excluded.local_revision,hub_revision=excluded.hub_revision', id, type, entityId, deleted ? null : json(payload), +deleted, revision, hubRevision);
  }
  private validate(type: string, entityId: string, payload: unknown): unknown {
    if (type === 'favorite') { const value = favoriteCodec.decode(payload); if (!value || value.id !== entityId) throw new Error('Invalid favorite record.'); return favoriteCodec.encode(value); }
    if (type === 'setting') { const value = settingCodec.decode(payload); if (!value || settingEntityId(value.namespace, value.key) !== entityId || !isSyncableSettingKey(value.namespace, value.key, this.options.tools ?? [])) throw new Error('Setting scope is not approved for mobile sync.'); return settingCodec.encode(value); }
    throw new Error('Android only synchronizes favorites and settings.');
  }
  private async journal(tx: SqlConnection, context: StorageContext, type: string, entityId: string, payload: unknown, deleted: boolean, localRevision: number): Promise<string | undefined> {
    const record = await tx.first<RecordRow>('SELECT * FROM records WHERE context_id=? AND entity_type=? AND entity_id=?', context.id, type, entityId);
    const previousRow = await tx.first<OutboxRow>('SELECT * FROM outbox WHERE context_id=? AND entity_type=? AND entity_id=? AND claimed=0 AND rejected IS NULL ORDER BY sequence DESC LIMIT 1', context.id, type, entityId);
    const uncertain = await tx.first('SELECT op_id FROM outbox WHERE context_id=? AND entity_type=? AND entity_id=? AND claimed=1 LIMIT 1', context.id, type, entityId);
    const next: OutboxOp = { opId: this.options.id(), environmentId: context.environmentId, deviceId: context.deviceId, entityType: type, entityId, opKind: deleted ? 'delete' : 'upsert', schemaVersion: 1, basedOnRevision: record?.hub_revision ?? null, localRevision, payload: deleted ? null : payload, status: context.kind === 'standalone' ? 'unsent-standalone' : 'pending', createdAt: this.now(), updatedAt: this.now() };
    const previous = previousRow ? decodeOperation(previousRow) : undefined;
    // Cancellation is unsafe if any older request may have reached the Hub. Keep the tombstone until that request is acknowledged.
    const result = uncertain && previous?.opKind === 'upsert' && deleted && previous.basedOnRevision === null
      ? { ...next, createdAt: previous.createdAt } : coalesceOutbox(previous, next);
    if (previousRow) await tx.run('DELETE FROM outbox WHERE op_id=?', previousRow.op_id);
    if (!result) return undefined;
    const count = (await tx.first<{ count: number }>('SELECT COUNT(*) AS count FROM outbox WHERE context_id=?', context.id))!.count;
    if (count >= OUTBOX_MAX_ROWS) throw new Error('Pending edit limit reached. Sync or export pending edits before making more changes.');
    if (utf8Bytes(json(result.payload)) > SYNC_LIMITS.maxRecordBytes) throw new Error('Record exceeds the shared sync size limit.');
    await tx.run('INSERT INTO outbox(context_id,op_id,entity_type,entity_id,body) VALUES(?,?,?,?,?)', context.id, result.opId, type, entityId, json(result));
    return result.opId;
  }
  entityRepository<T>(id: string, codec: EntityCodec<T>): EntityCollectionRepository<T> {
    const values = async () => (await this.listRecords(id)).filter(r => r.entityType === codec.entityType && !r.deleted).map(r => codec.decode(r.payload)).filter((v): v is T => v !== null);
    const commit = async (entries: readonly { entityId: string; payload: unknown; deleted: boolean }[]): Promise<CommitResult> => this.write(async tx => {
      const context = await this.writable(tx, id);
      const effective: typeof entries[number][] = [];
      for (const entry of entries) {
        if (!entry.deleted || await tx.first('SELECT 1 FROM records WHERE context_id=? AND entity_type=? AND entity_id=? AND deleted=0', id, codec.entityType, entry.entityId)) effective.push(entry);
      }
      if (!effective.length) return { localRevision: context.localRevision };
      const localRevision = await this.bump(tx, id); let outboxOpId: string | undefined;
      for (const entry of effective) {
        const payload = entry.deleted ? null : codec.encode(codec.decode(entry.payload) ?? (() => { throw new Error('Invalid entity payload.'); })());
        const existing = await tx.first<RecordRow>('SELECT * FROM records WHERE context_id=? AND entity_type=? AND entity_id=?', id, codec.entityType, entry.entityId);
        if (codec.entityType !== 'favorite') throw new Error('Only the favorite collection is available on Android.');
        await this.putRecord(tx, id, codec.entityType, entry.entityId, payload, entry.deleted, localRevision, existing?.hub_revision ?? null);
        outboxOpId = await this.journal(tx, context, codec.entityType, entry.entityId, payload, entry.deleted, localRevision);
      }
      return { localRevision, ...(outboxOpId ? { outboxOpId } : {}) };
    });
    return { list: values, get: async entityId => (await values()).find(v => codec.idOf(v) === entityId), upsert: value => commit([{ entityId: codec.idOf(value), payload: value, deleted: false }]), remove: entityId => commit([{ entityId, payload: null, deleted: true }]), importMany: entries => commit(entries.map(value => ({ entityId: codec.idOf(value), payload: value, deleted: false }))) };
  }
  favoriteRepository(id: string): EntityCollectionRepository<FavoriteItem> { return this.entityRepository(id, favoriteCodec); }
  kvRepository(id: string): KeyValueRepository {
    return {
      get: async (namespace, key) => { const row = await this.database.first<{ value: string }>('SELECT value FROM kv WHERE context_id=? AND namespace=? AND key=?', id, namespace, key); return row ? JSON.parse(row.value) : undefined; },
      set: (namespace, key, value, meta) => this.write(tx => this.setKv(tx, id, namespace, key, value, meta)),
      remove: (namespace, key) => this.write(async tx => {
        const context = await this.writable(tx, id); const row = await tx.first('SELECT 1 FROM kv WHERE context_id=? AND namespace=? AND key=?', id, namespace, key);
        if (!row) return;
        await tx.run('DELETE FROM kv WHERE context_id=? AND namespace=? AND key=?', id, namespace, key);
        const revision = await this.bump(tx, id);
        if (isSyncableSettingKey(namespace, key, this.options.tools ?? [])) {
          const entityId = settingEntityId(namespace, key); const old = await tx.first<RecordRow>('SELECT * FROM records WHERE context_id=? AND entity_type=? AND entity_id=?', id, 'setting', entityId);
          await this.putRecord(tx, id, 'setting', entityId, null, true, revision, old?.hub_revision ?? null);
          await this.journal(tx, context, 'setting', entityId, null, true, revision);
        }
      }),
      keys: async prefix => (await this.database.all<{ namespace: string; key: string }>('SELECT namespace,key FROM kv WHERE context_id=? ORDER BY namespace,key', id)).filter(r => !prefix || r.namespace.startsWith(prefix)),
      snapshot: async () => (await this.database.all<{ namespace: string; key: string; value: string }>('SELECT namespace,key,value FROM kv WHERE context_id=? ORDER BY namespace,key', id)).map(r => ({ ...r, value: JSON.parse(r.value) })),
    };
  }
  private async setKv(tx: SqlConnection, id: string, namespace: string, key: string, value: unknown, meta: KvWriteMeta): Promise<void> {
    const context = await this.writable(tx, id); const definition = findSettingDefinition(namespace, key);
    if (definition?.sensitivity === 'secret' || definition?.storage === 'secret') throw new Error('Credentials must remain in Android Keystore.');
    const scope = resolveKvScope(namespace, key, meta.policy, createManifestScopeLookup(this.options.tools ?? []));
    if (scope !== meta.scope) throw new Error('Setting scope does not match the shared definition.');
    await tx.run('INSERT INTO kv(context_id,namespace,key,value) VALUES(?,?,?,?) ON CONFLICT(context_id,namespace,key) DO UPDATE SET value=excluded.value', id, namespace, key, json(value));
    const revision = await this.bump(tx, id);
    if (scope === 'environment' && isSyncableSettingKey(namespace, key, this.options.tools ?? [])) {
      const payload: SettingEntity = { namespace, key, value }; const entityId = settingEntityId(namespace, key);
      const old = await tx.first<RecordRow>('SELECT * FROM records WHERE context_id=? AND entity_type=? AND entity_id=?', id, 'setting', entityId);
      await this.putRecord(tx, id, 'setting', entityId, payload, false, revision, old?.hub_revision ?? null);
      await this.journal(tx, context, 'setting', entityId, payload, false, revision);
    }
  }
  async readEnrollment(): Promise<MobileHubEnrollment | null> { return this.readMeta(this.database, 'enrollment'); }
  async readPendingAttempt(): Promise<MobileEnrollmentAttempt | null> { return this.readMeta(this.database, 'pending_attempt'); }
  async savePendingAttempt(attempt: MobileEnrollmentAttempt): Promise<void> { await this.write(async tx => {
    await this.meta(tx, 'pending_attempt', receipt(attempt, true));
    // Recovery must retain the reviewed cache even if the user browses another context before the receipt is confirmed.
    await this.meta(tx, 'pending_attempt_context', await this.readMeta<string>(tx, 'active_context'));
  }); }
  async clearPendingAttempt(): Promise<void> { await this.write(tx => tx.run('DELETE FROM metadata WHERE key IN (?,?)', 'pending_attempt', 'pending_attempt_context')); }
  async saveEnrollment(enrollment: MobileHubEnrollment): Promise<void> { await this.write(async tx => {
    const existing = await this.readMeta<MobileHubEnrollment>(tx, 'enrollment');
    if (!existing || existing.environmentId !== enrollment.environmentId || existing.deviceId !== enrollment.deviceId || existing.hubInstanceId !== enrollment.hubInstanceId || existing.keyRef !== enrollment.keyRef || existing.publicKey !== enrollment.publicKey || enrollment.authorityEpoch < existing.authorityEpoch) throw new Error('Enrollment authority or signing identity changed. Re-pair explicitly.');
    const safe = receipt(enrollment); await this.meta(tx, 'enrollment', safe);
    const context = await tx.first<{ id: string }>('SELECT id FROM contexts WHERE kind=?', 'environment'); if (context) await this.meta(tx, `context_enrollment:${context.id}`, safe);
  }); }
  async commitEnrollment(enrollment: MobileHubEnrollment): Promise<void> { await this.write(async tx => {
    const safe = receipt(enrollment); const attempt = await this.readMeta<MobileEnrollmentAttempt>(tx, 'pending_attempt');
    if (!attempt || attempt.deviceId !== safe.deviceId || attempt.environmentId !== safe.environmentId || attempt.keyRef !== safe.keyRef || attempt.hubInstanceId !== safe.hubInstanceId) throw new Error('Enrollment does not match its durable attempt.');
    const current = await tx.first<ContextRow>('SELECT * FROM contexts WHERE kind=?', 'environment');
    const sourceId = await this.readMeta<string>(tx, 'pending_attempt_context') ?? await this.readMeta<string>(tx, 'active_context');
    const source = sourceId ? await tx.first<ContextRow>('SELECT * FROM contexts WHERE id=?', sourceId) : null;
    const selectedArchive = source?.kind === 'archive' && source.environment_id === safe.environmentId && source.device_id === safe.deviceId ? source : null;
    const restored = await tx.first<ContextRow>('SELECT * FROM contexts WHERE kind=? AND environment_id=? AND device_id=? ORDER BY rowid DESC LIMIT 1', 'archive', safe.environmentId, safe.deviceId);
    const retained = selectedArchive ?? (current && current.environment_id === safe.environmentId && current.device_id === safe.deviceId ? current : restored);
    let contextId: string;
    if (retained) {
      if (current && current.id !== retained.id) await tx.run('UPDATE contexts SET kind=?,writable=0 WHERE id=?', 'archive', current.id);
      contextId = retained.id;
      const previous = await this.readMeta<RecoveryExport['authority']>(tx, `context_enrollment:${contextId}`) ?? await this.readMeta<RecoveryExport['authority']>(tx, `context_authority:${contextId}`);
      const changedAuthority = previous && (previous.hubInstanceId !== safe.hubInstanceId || previous.authorityEpoch !== safe.authorityEpoch);
      if (changedAuthority) {
        const unfinished = await this.readMeta<RepairAuthority>(tx, `repair_authority:${contextId}`);
        await this.recoveryCopyTx(tx, contextId, 'before-authority-repair');
        await this.meta(tx, `repair_authority:${contextId}`, { previousHubInstanceId: unfinished?.previousHubInstanceId ?? previous.hubInstanceId, previousEpoch: unfinished?.previousEpoch ?? previous.authorityEpoch,
          previousHead: Math.max(retained.head, unfinished?.previousHead ?? 0), hubInstanceId: safe.hubInstanceId, epoch: safe.authorityEpoch, categories: CATEGORIES } satisfies RepairAuthority);
      }
      await tx.run('UPDATE contexts SET kind=?,writable=1,cursor=0,head=?,epoch=?,consent=0 WHERE id=?', 'environment', changedAuthority ? 0 : retained.head, safe.authorityEpoch, contextId);
      // Existing pending/claimed operations and records are preserved for a fresh consent preview.
    } else {
      if (current) await tx.run('UPDATE contexts SET kind=?,writable=0 WHERE id=?', 'archive', current.id);
      contextId = this.options.id();
      await tx.run('INSERT INTO contexts(id,kind,environment_id,device_id,writable,epoch) VALUES(?,?,?,?,1,?)', contextId, 'environment', safe.environmentId, safe.deviceId, safe.authorityEpoch);
      const standalone = await tx.first<{ id: string }>('SELECT id FROM contexts WHERE kind=?', 'standalone');
      if (standalone) {
        await tx.run('INSERT INTO records SELECT ?,entity_type,entity_id,payload,deleted,local_revision,NULL FROM records WHERE context_id=?', contextId, standalone.id);
        await tx.run('INSERT INTO kv SELECT ?,namespace,key,value FROM kv WHERE context_id=?', contextId, standalone.id);
        const source = await this.context(standalone.id, tx);
        await tx.run('UPDATE contexts SET local_revision=? WHERE id=?', source.localRevision, contextId);
      }
    }
    const previousEnrollment = await this.readMeta<MobileHubEnrollment>(tx, 'enrollment');
    if (previousEnrollment && previousEnrollment.keyRef !== safe.keyRef) {
      const keys = await this.readMeta<string[]>(tx, 'retired_signing_keys') ?? [];
      await this.meta(tx, 'retired_signing_keys', [...new Set([...keys, previousEnrollment.keyRef])]);
    }
    await this.meta(tx, 'enrollment', safe); await this.meta(tx, `context_enrollment:${contextId}`, safe); await this.meta(tx, 'active_context', contextId);
    await tx.run('DELETE FROM metadata WHERE key=?', `context_failure:${contextId}`);
    await tx.run('DELETE FROM metadata WHERE key IN (?,?)', 'pending_attempt', 'pending_attempt_context');
  }); }
  async pendingKeyCleanup(): Promise<readonly string[]> { return await this.readMeta<string[]>(this.database, 'retired_signing_keys') ?? []; }
  async completeKeyCleanup(keyRef: string): Promise<void> { await this.write(async tx => {
    const keys = (await this.readMeta<string[]>(tx, 'retired_signing_keys') ?? []).filter(key => key !== keyRef);
    if (keys.length) await this.meta(tx, 'retired_signing_keys', keys);
    else await tx.run('DELETE FROM metadata WHERE key=?', 'retired_signing_keys');
  }); }
  async repairState(id: string): Promise<RepairAuthority | null> { return this.readMeta(this.database, `repair_authority:${id}`); }
  async failureState(id: string): Promise<'revoked' | 'missing-key' | 'authority-changed' | null> { return this.readMeta(this.database, `context_failure:${id}`); }
  async setCategories(id: string, flags: CategoryFlags): Promise<void> { await this.write(async tx => {
    const context = await this.writable(tx, id);
    if (typeof flags.favorites !== 'boolean' || typeof flags.settings !== 'boolean') throw new Error('Invalid category selection.');
    const enabledNew = CATEGORIES.some(c => flags[c] && !context.categories[c]);
    await tx.run('UPDATE contexts SET categories=?,consent=?,local_revision=local_revision+1 WHERE id=?', json({ favorites: flags.favorites, settings: flags.settings }), enabledNew ? 0 : +context.consent, id);
  }); }
  async claimBatch(id: string, categories: readonly MobileCategory[], limit: number = SYNC_LIMITS.maxPushOps, uncertainOnly = false): Promise<ClaimedOperation[]> { validCategories(categories); return this.write(async tx => {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid push batch limit.');
    const context = await this.writable(tx, id); if (context.kind !== 'environment' || !context.consent && !uncertainOnly) return [];
    const seen = new Set<string>(); const result: ClaimedOperation[] = [];
    for (const op of await this.pending(id, tx)) {
      const key = `${op.entityType}:${op.entityId}`; if (seen.has(key)) continue; seen.add(key);
      const category = categoryOf(op.entityType) as MobileCategory;
      if (op.rejected || uncertainOnly && !op.claimed || !context.categories[category] || !categories.includes(category)) continue;
      if (result.length >= Math.min(limit, SYNC_LIMITS.maxPushOps)) break;
      await tx.run('UPDATE outbox SET claimed=1 WHERE op_id=?', op.opId); result.push({ ...op, claimed: true });
    }
    return result;
  }); }
  async acknowledge(id: string, results: PushResults): Promise<void> { await this.write(async tx => {
    await this.writable(tx, id);
    for (const result of results) {
      const row = await tx.first<OutboxRow>('SELECT * FROM outbox WHERE context_id=? AND op_id=?', id, result.opId); if (!row) continue;
      const op = decodeOperation(row); if (!op.claimed) throw new Error('Hub acknowledged an operation that was never claimed.');
      if (result.status === 'rejected') { await tx.run('UPDATE outbox SET rejected=? WHERE op_id=?', result.reason, op.opId); continue; }
      if (result.status === 'conflict') throw new Error('Unexpected conflict for mobile last-write-wins category. Preserve pending edits.');
      await tx.run('DELETE FROM outbox WHERE op_id=?', op.opId);
      await tx.run('UPDATE records SET hub_revision=MAX(COALESCE(hub_revision,0),?) WHERE context_id=? AND entity_type=? AND entity_id=?', result.revision, id, op.entityType, op.entityId);
      const current = await tx.first<{ hub_revision: number }>('SELECT hub_revision FROM records WHERE context_id=? AND entity_type=? AND entity_id=?', id, op.entityType, op.entityId);
      for (const newer of await this.pending(id, tx)) if (newer.entityType === op.entityType && newer.entityId === op.entityId && !newer.claimed) {
        const { claimed: _claimed, rejected: _rejected, ...newerBody } = newer;
        const body: OutboxOp = { ...newerBody, basedOnRevision: Math.max(current?.hub_revision ?? 0, result.revision, newer.basedOnRevision ?? 0) };
        await tx.run('UPDATE outbox SET body=? WHERE op_id=?', json(body), newer.opId);
      }
      await tx.run('UPDATE contexts SET head=MAX(head,?) WHERE id=?', result.revision, id);
    }
  }); }
  private async applyRecord(tx: SqlConnection, id: string, record: SyncRecord, preservePending: boolean): Promise<void> {
    const context = await this.context(id, tx); const category = categoryOf(record.entityType);
    if (!CATEGORIES.includes(category as MobileCategory) || !context.categories[category as MobileCategory]) throw new Error('Hub returned an unapproved category.');
    const payload = record.deleted ? null : this.validate(record.entityType, record.entityId, record.payload);
    const old = await tx.first<RecordRow>('SELECT * FROM records WHERE context_id=? AND entity_type=? AND entity_id=?', id, record.entityType, record.entityId);
    if (old?.hub_revision != null && record.revision <= old.hub_revision) return;
    const pending = preservePending && await tx.first('SELECT 1 FROM outbox WHERE context_id=? AND entity_type=? AND entity_id=?', id, record.entityType, record.entityId);
    if (pending) { await tx.run('UPDATE records SET hub_revision=? WHERE context_id=? AND entity_type=? AND entity_id=?', record.revision, id, record.entityType, record.entityId); return; }
    await this.putRecord(tx, id, record.entityType, record.entityId, payload, record.deleted, context.localRevision, record.revision);
    if (record.entityType === 'setting') {
      if (record.deleted) {
        const previous = old?.payload ? settingCodec.decode(JSON.parse(old.payload)) : null;
        if (previous) await tx.run('DELETE FROM kv WHERE context_id=? AND namespace=? AND key=?', id, previous.namespace, previous.key);
      } else {
        const setting = payload as SettingEntity;
        await tx.run('INSERT INTO kv(context_id,namespace,key,value) VALUES(?,?,?,?) ON CONFLICT(context_id,namespace,key) DO UPDATE SET value=excluded.value', id, setting.namespace, setting.key, json(setting.value));
      }
    }
  }
  async applyChanges(id: string, records: readonly SyncRecord[], cursor: number, head: number, epoch: number): Promise<void> { await this.write(async tx => {
    const context = await this.writable(tx, id);
    if (!context.consent || epoch !== context.epoch || head < context.head || cursor < context.cursor || cursor > head || records.some(r => r.revision > cursor)) throw new Error('Hub authority or acknowledged history regressed. Preserve cache and reconcile.');
    for (const record of records) await this.applyRecord(tx, id, record, true);
    await tx.run('UPDATE contexts SET cursor=?,head=? WHERE id=?', cursor, head, id);
  }); }
  async beginSnapshot(id: string, categories: readonly MobileCategory[], head: number, epoch: number): Promise<string> { validCategories(categories); return this.write(async tx => {
    const context = await this.writable(tx, id);
    if (epoch !== context.epoch || head < context.head || !Number.isSafeInteger(head)) throw new Error('Hub authority or acknowledged history regressed.');
    const stageId = this.options.id();
    await tx.run('INSERT INTO snapshots(id,context_id,categories,cursor,head,epoch,local_revision) VALUES(?,?,?,?,?,?,?)', stageId, id, json(categories), head, head, epoch, context.localRevision); return stageId;
  }); }
  async stageSnapshotPage(stageId: string, records: readonly SyncRecord[], complete = false, pageHead?: number): Promise<void> { await this.write(async tx => {
    const stage = await tx.first<SnapshotRow>('SELECT * FROM snapshots WHERE id=?', stageId); if (!stage || stage.complete) throw new Error('Snapshot stage is unavailable.');
    const categories: readonly MobileCategory[] = JSON.parse(stage.categories);
    const head = pageHead ?? stage.head;
    if (head < stage.head || !Number.isSafeInteger(head)) throw new Error('Snapshot history regressed during pagination.');
    for (const record of records) {
      if (!categories.includes(categoryOf(record.entityType) as MobileCategory) || record.revision > head) throw new Error('Snapshot category or revision mismatch.');
      if (!record.deleted) this.validate(record.entityType, record.entityId, record.payload);
      await tx.run('INSERT INTO snapshot_records VALUES(?,?,?,?) ON CONFLICT(snapshot_id,entity_type,entity_id) DO UPDATE SET body=excluded.body', stageId, record.entityType, record.entityId, json(record));
    }
    await tx.run('UPDATE snapshots SET complete=?,head=? WHERE id=?', +complete, head, stageId);
  }); }
  async stagedSnapshot(stageId: string, tx: SqlConnection = this.database): Promise<StagedSnapshot> {
    const stage = await tx.first<SnapshotRow>('SELECT * FROM snapshots WHERE id=?', stageId); if (!stage) throw new Error('Snapshot stage is unavailable.');
    return { id: stage.id, contextId: stage.context_id, categories: JSON.parse(stage.categories), cursor: stage.cursor, head: stage.head, epoch: stage.epoch, localRevision: stage.local_revision, complete: !!stage.complete, records: (await tx.all<{ body: string }>('SELECT body FROM snapshot_records WHERE snapshot_id=? ORDER BY entity_type,entity_id', stageId)).map(r => JSON.parse(r.body)) };
  }
  async discardSnapshot(stageId: string): Promise<void> { await this.write(async tx => { await tx.run('DELETE FROM snapshot_records WHERE snapshot_id=?', stageId); await tx.run('DELETE FROM snapshots WHERE id=?', stageId); }); }
  async commitSnapshot(stageId: string, approval: { choices: Readonly<Partial<Record<MobileCategory, SnapshotChoice>>>; expectedLocalRevision: number; preservePending?: boolean }): Promise<void> { await this.write(async tx => {
    const stage = await this.stagedSnapshot(stageId, tx); const context = await this.writable(tx, stage.contextId);
    if (!stage.complete || context.localRevision !== approval.expectedLocalRevision || stage.localRevision !== approval.expectedLocalRevision || context.epoch !== stage.epoch || context.head > stage.head) throw new Error('Preview is stale. Refresh it before approving.');
    for (const category of stage.categories) if (!['merge', 'hub', 'local'].includes(approval.choices[category] ?? '')) throw new Error('Every selected category needs a choice.');
    const local = await this.listRecords(context.id, tx);
    const repair = await this.readMeta<RepairAuthority>(tx, `repair_authority:${context.id}`);
    const reviewedNewAuthority = repair && repair.hubInstanceId === (await this.readMeta<MobileHubEnrollment>(tx, `context_enrollment:${context.id}`))?.hubInstanceId && repair.epoch === stage.epoch && stage.categories.some(category => repair.categories.includes(category));
    const regressed = local.some(r => stage.categories.includes(categoryOf(r.entityType) as MobileCategory) && r.hubRevision !== null && r.hubRevision > stage.head) || !!reviewedNewAuthority && stage.head < repair.previousHead;
    if (regressed && (!reviewedNewAuthority || approval.preservePending || stage.categories.some(category => approval.choices[category] === 'hub'))) throw new Error('Snapshot regressed acknowledged history. Use Merge or Use local after reviewing the new Hub authority; destructive Use Hub is refused.');
    // An uncertain delivery must be resolved first, rather than deleting stable operation identities during reconciliation.
    if (!approval.preservePending && (await this.pending(context.id, tx)).some(op => op.claimed && stage.categories.includes(categoryOf(op.entityType) as MobileCategory))) throw new Error('Resolve in-flight operations before snapshot approval. Pending edits are preserved.');
    if (approval.preservePending) {
      const pending = await this.pending(context.id, tx);
      await this.recoveryCopyTx(tx, context.id, 'cursor-reconcile');
      for (const record of local) if (stage.categories.includes(categoryOf(record.entityType) as MobileCategory)) {
        if (pending.some(op => op.entityType === record.entityType && op.entityId === record.entityId)) continue;
        if (record.hubRevision !== null && !stage.records.some(remote => remote.entityType === record.entityType && remote.entityId === record.entityId)) {
          await tx.run('DELETE FROM records WHERE context_id=? AND entity_type=? AND entity_id=?', context.id, record.entityType, record.entityId);
          if (record.entityType === 'setting' && !record.deleted) { const s = settingCodec.decode(record.payload)!; await tx.run('DELETE FROM kv WHERE context_id=? AND namespace=? AND key=?', context.id, s.namespace, s.key); }
        }
      }
      for (const record of stage.records) await this.applyRecord(tx, context.id, record, true);
      await tx.run('UPDATE contexts SET cursor=?,head=? WHERE id=?', stage.cursor, stage.head, context.id);
      await tx.run('DELETE FROM snapshot_records WHERE snapshot_id=?', stageId); await tx.run('DELETE FROM snapshots WHERE id=?', stageId);
      return;
    }
    if (stage.categories.some(c => approval.choices[c] === 'hub')) await this.recoveryCopyTx(tx, context.id, 'use-hub');
    const selected = new Set(stage.categories); const remote = new Map(stage.records.map(r => [`${r.entityType}:${r.entityId}`, r]));
    await tx.run('UPDATE contexts SET categories=? WHERE id=?', json({ ...context.categories, ...Object.fromEntries(stage.categories.map(c => [c, true])) }), context.id);
    for (const op of await this.pending(context.id, tx)) if (selected.has(categoryOf(op.entityType) as MobileCategory)) await tx.run('DELETE FROM outbox WHERE op_id=?', op.opId);
    for (const record of local) {
      const category = categoryOf(record.entityType) as MobileCategory; if (!selected.has(category)) continue;
      const hubRecord = remote.get(`${record.entityType}:${record.entityId}`); const choice = approval.choices[category];
      if (choice === 'hub' && !hubRecord) {
        await tx.run('DELETE FROM records WHERE context_id=? AND entity_type=? AND entity_id=?', context.id, record.entityType, record.entityId);
        if (record.entityType === 'setting' && !record.deleted) { const s = settingCodec.decode(record.payload)!; await tx.run('DELETE FROM kv WHERE context_id=? AND namespace=? AND key=?', context.id, s.namespace, s.key); }
      } else if (choice === 'local' || choice === 'merge' && !hubRecord) {
        // Copy the new base before journaling, preserving the user's local payload.
        await tx.run('UPDATE records SET hub_revision=? WHERE context_id=? AND entity_type=? AND entity_id=?', hubRecord?.revision ?? null, context.id, record.entityType, record.entityId);
        await this.journal(tx, { ...context, kind: 'environment' }, record.entityType, record.entityId, record.payload, record.deleted, record.localRevision);
      }
    }
    for (const record of stage.records) {
      const choice = approval.choices[categoryOf(record.entityType) as MobileCategory];
      if (choice !== 'local' || !local.some(r => r.entityType === record.entityType && r.entityId === record.entityId)) {
        // Reconciliation must replace a same-revision local record too.
        await tx.run('UPDATE records SET hub_revision=NULL WHERE context_id=? AND entity_type=? AND entity_id=?', context.id, record.entityType, record.entityId);
        await this.applyRecord(tx, context.id, record, false);
      }
    }
    await tx.run('UPDATE contexts SET cursor=?,head=?,consent=1 WHERE id=?', stage.cursor, stage.head, context.id);
    if (reviewedNewAuthority) {
      const remaining = repair.categories.filter(category => !stage.categories.includes(category));
      if (remaining.length) await this.meta(tx, `repair_authority:${context.id}`, { ...repair, categories: remaining });
      else await tx.run('DELETE FROM metadata WHERE key=?', `repair_authority:${context.id}`);
    }
    await tx.run('DELETE FROM snapshot_records WHERE snapshot_id=?', stageId); await tx.run('DELETE FROM snapshots WHERE id=?', stageId);
  }); }
  private async exportTx(tx: SqlConnection, id: string): Promise<RecoveryExport> {
    const context = await this.context(id, tx); const enrollment = await this.readMeta<MobileHubEnrollment>(tx, `context_enrollment:${id}`);
    return { format: 'dude-mobile-recovery', version: 1, deviceId: context.deviceId, context,
      records: await this.listRecords(id, tx), pending: await this.pending(id, tx),
      settings: (await tx.all<{ namespace: string; key: string; value: string }>('SELECT namespace,key,value FROM kv WHERE context_id=?', id)).filter(r => { const definition = findSettingDefinition(r.namespace, r.key); return !definition || definition.sensitivity !== 'secret' && definition.storage !== 'secret'; }).map(r => ({ ...r, value: JSON.parse(r.value) })),
      authority: enrollment && enrollment.environmentId === context.environmentId ? { environmentId: enrollment.environmentId, hubInstanceId: enrollment.hubInstanceId, authorityEpoch: enrollment.authorityEpoch } : await this.readMeta<RecoveryExport['authority']>(tx, `context_authority:${id}`) };
  }
  async exportRecovery(id: string): Promise<RecoveryExport> { return this.database.exclusive(tx => this.exportTx(tx, id)); }
  private async recoveryCopyTx(tx: SqlConnection, id: string, reason: string): Promise<string> { const copyId = this.options.id(); await tx.run('INSERT INTO recovery_copies VALUES(?,?,?,?,?)', copyId, id, reason, this.now(), json(await this.exportTx(tx, id))); return copyId; }
  async createRecoveryCopy(id: string, reason: string): Promise<string> { return this.write(tx => this.recoveryCopyTx(tx, id, reason)); }
  async recoveryCopies(id: string): Promise<readonly { id: string; reason: string; createdAt: string }[]> { return this.database.all('SELECT id,reason,created_at AS createdAt FROM recovery_copies WHERE context_id=? ORDER BY rowid', id); }
  async readRecoveryCopy(copyId: string): Promise<RecoveryExport> {
    const row = await this.database.first<{ body: string }>('SELECT body FROM recovery_copies WHERE id=?', copyId);
    if (!row) throw new Error('Recovery copy does not exist.'); return JSON.parse(row.body) as RecoveryExport;
  }
  /** Validate before a transaction starts, then import to an isolated read-only archive. Never replaces existing data. */
  async importRecovery(text: string): Promise<string> {
    if (utf8Bytes(text) > 64 * 1024 * 1024) throw new Error('Recovery export exceeds the import size limit.');
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== 'object') throw new Error('Invalid recovery export.');
    const value = raw as RecoveryExport;
    const allowed = ['format', 'version', 'deviceId', 'context', 'records', 'pending', 'settings', 'authority'];
    if (Object.keys(raw).some(key => !allowed.includes(key)) || value.format !== 'dude-mobile-recovery' || value.version !== 1 || typeof value.deviceId !== 'string' || !value.deviceId || !value.context || typeof value.context.environmentId !== 'string' || !value.context.environmentId || !Array.isArray(value.records) || !Array.isArray(value.pending) || !Array.isArray(value.settings)) throw new Error('Invalid recovery export.');
    for (const number of [value.context.cursor, value.context.head, value.context.epoch, value.context.localRevision]) if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid recovery revision.');
    if (value.context.cursor > value.context.head || value.context.deviceId !== value.deviceId || value.pending.length > OUTBOX_MAX_ROWS) throw new Error('Invalid recovery identity or pending operations.');
    for (const category of CATEGORIES) if (typeof value.context.categories?.[category] !== 'boolean') throw new Error('Invalid recovery category selection.');
    if (value.authority && (typeof value.authority.hubInstanceId !== 'string' || !value.authority.hubInstanceId || value.authority.environmentId !== value.context.environmentId || !Number.isSafeInteger(value.authority.authorityEpoch) || value.authority.authorityEpoch < 1 || Object.keys(value.authority).some(key => !['environmentId', 'hubInstanceId', 'authorityEpoch'].includes(key)))) throw new Error('Invalid recovery authority.');
    const recordKeys = new Set<string>();
    for (const record of value.records) {
      const key = `${record.entityType}:${record.entityId}`;
      if (recordKeys.has(key) || typeof record.deleted !== 'boolean' || !Number.isSafeInteger(record.localRevision) || record.localRevision < 0 || record.hubRevision !== null && (!Number.isSafeInteger(record.hubRevision) || record.hubRevision < 0) || !CATEGORIES.includes(categoryOf(record.entityType) as MobileCategory)) throw new Error('Invalid recovery record.');
      recordKeys.add(key); if (!record.deleted) this.validate(record.entityType, record.entityId, record.payload);
    }
    const opIds = new Set<string>();
    for (const op of value.pending) {
      const keys = ['opId', 'environmentId', 'deviceId', 'entityType', 'entityId', 'opKind', 'schemaVersion', 'basedOnRevision', 'localRevision', 'payload', 'status', 'createdAt', 'updatedAt', 'claimed', 'rejected'];
      if (!op.opId || typeof op.opId !== 'string' || opIds.has(op.opId) || op.environmentId !== value.context.environmentId || op.deviceId !== value.deviceId || !['upsert', 'delete'].includes(op.opKind) || op.schemaVersion !== 1 || typeof op.claimed !== 'boolean' || op.rejected !== null && typeof op.rejected !== 'string' || Object.keys(op).some(key => !keys.includes(key)) || !Number.isSafeInteger(op.localRevision) || op.localRevision < 0 || op.basedOnRevision !== null && (!Number.isSafeInteger(op.basedOnRevision) || op.basedOnRevision < 0) || !['unsent-standalone', 'pending', 'quarantined', 'stranded'].includes(op.status) || typeof op.createdAt !== 'string' || typeof op.updatedAt !== 'string') throw new Error('Invalid recovery operation.');
      if (!recordKeys.has(`${op.entityType}:${op.entityId}`)) throw new Error('Recovery operation is missing its cached record.');
      opIds.add(op.opId); if (op.opKind === 'upsert') this.validate(op.entityType, op.entityId, op.payload);
    }
    for (const setting of value.settings) {
      if (typeof setting.namespace !== 'string' || typeof setting.key !== 'string' || !Object.hasOwn(setting, 'value')) throw new Error('Invalid recovery setting.');
      const definition = findSettingDefinition(setting.namespace, setting.key);
      if (definition?.sensitivity === 'secret' || definition?.storage === 'secret') throw new Error('Recovery exports cannot contain credentials.');
    }
    return this.write(async tx => {
      const contextId = this.options.id();
      await tx.run('INSERT INTO contexts(id,kind,environment_id,device_id,writable,local_revision,cursor,head,epoch,categories,consent) VALUES(?,?,?,?,0,?,?,?,?,?,0)', contextId, 'archive', value.context.environmentId, value.deviceId, value.context.localRevision, value.context.cursor, value.context.head, value.context.epoch, json(value.context.categories));
      for (const record of value.records) await this.putRecord(tx, contextId, record.entityType, record.entityId, record.payload, record.deleted, record.localRevision, record.hubRevision);
      for (const setting of value.settings) await tx.run('INSERT INTO kv VALUES(?,?,?,?)', contextId, setting.namespace, setting.key, json(setting.value));
      for (const op of value.pending) {
        if (await tx.first('SELECT 1 FROM outbox WHERE op_id=?', op.opId)) throw new Error('Recovery operation already exists in this installation. Select its existing archive instead.');
        const body: OutboxOp = { opId: op.opId, environmentId: op.environmentId, deviceId: op.deviceId, entityType: op.entityType, entityId: op.entityId, opKind: op.opKind, schemaVersion: op.schemaVersion, basedOnRevision: op.basedOnRevision, localRevision: op.localRevision, payload: op.payload, status: op.status, createdAt: op.createdAt, updatedAt: op.updatedAt };
        await tx.run('INSERT INTO outbox(context_id,op_id,entity_type,entity_id,body,claimed,rejected) VALUES(?,?,?,?,?,?,?)', contextId, op.opId, op.entityType, op.entityId, json(body), +op.claimed, op.rejected);
      }
      const count = (await tx.first<{ count: number }>('SELECT COUNT(*) AS count FROM outbox WHERE context_id=?', contextId))!.count; if (count > OUTBOX_MAX_ROWS) throw new Error('Recovery import exceeds the pending edit ceiling.');
      if (value.authority) await this.meta(tx, `context_authority:${contextId}`, value.authority);
      await this.meta(tx, 'active_context', contextId); return contextId;
    });
  }
  async activateArchiveForPairing(id: string): Promise<void> { await this.write(async tx => { const context = await this.context(id, tx); if (context.kind !== 'archive') throw new Error('Select a retained archive for re-pairing.'); await this.meta(tx, 'active_context', id); }); }
  /** Remote/session failure freezes a cache and keeps every operation; it never deletes an identity. */
  async freezeEnvironment(reason: 'revoked' | 'missing-key' | 'authority-changed'): Promise<void> { await this.write(async tx => {
    const context = await tx.first<ContextRow>('SELECT * FROM contexts WHERE kind=?', 'environment');
    if (!context) return;
    await this.meta(tx, `context_failure:${context.id}`, reason);
    if (!context.writable) return;
    await this.recoveryCopyTx(tx, context.id, reason);
    await tx.run('UPDATE contexts SET writable=0 WHERE id=?', context.id);
  }); }
  /** Copies selected archive values into standalone; both source and previous standalone are recoverable. */
  async convertArchiveToStandalone(id: string, expectedRevision: number, expectedStandaloneRevision?: number): Promise<void> { await this.write(async tx => {
    const source = await this.context(id, tx); if (source.kind !== 'archive' && source.writable || source.localRevision !== expectedRevision) throw new Error('Conversion preview is stale or the environment is still writable.');
    const targetRow = await tx.first<{ id: string }>('SELECT id FROM contexts WHERE kind=?', 'standalone'); const target = await this.writable(tx, targetRow!.id);
    if (expectedStandaloneRevision !== undefined && target.localRevision !== expectedStandaloneRevision) throw new Error('Standalone conversion preview is stale.');
    await this.recoveryCopyTx(tx, source.id, 'convert-source'); await this.recoveryCopyTx(tx, target.id, 'convert-standalone'); const revision = await this.bump(tx, target.id);
    for (const record of await this.listRecords(source.id, tx)) {
      await this.putRecord(tx, target.id, record.entityType, record.entityId, record.payload, record.deleted, revision, null);
      await this.journal(tx, target, record.entityType, record.entityId, record.payload, record.deleted, revision);
    }
    for (const setting of await tx.all<{ namespace: string; key: string; value: string }>('SELECT namespace,key,value FROM kv WHERE context_id=?', source.id)) await tx.run('INSERT INTO kv VALUES(?,?,?,?) ON CONFLICT(context_id,namespace,key) DO UPDATE SET value=excluded.value', target.id, setting.namespace, setting.key, setting.value);
    await this.meta(tx, 'active_context', target.id);
  }); }
  /** Internal lifecycle primitive; the lifecycle service must validate its confirmation boundary. */
  async archiveActive(reason: 'disconnect' | 'revoked'): Promise<void> { await this.write(async tx => {
    const enrollment = await this.readMeta<MobileHubEnrollment>(tx, 'enrollment'); if (!enrollment) return;
    const context = await tx.first<{ id: string }>('SELECT id FROM contexts WHERE kind=?', 'environment'); if (!context) throw new Error('Enrolled context is missing.');
    await this.recoveryCopyTx(tx, context.id, reason);
    if (reason === 'revoked') { await tx.run('UPDATE contexts SET writable=0 WHERE id=?', context.id); return; }
    await tx.run('UPDATE contexts SET kind=?,writable=0 WHERE id=?', 'archive', context.id);
    await tx.run('DELETE FROM metadata WHERE key IN (?,?,?)', 'enrollment', 'pending_attempt', 'pending_attempt_context');
    const standalone = await tx.first<{ id: string }>('SELECT id FROM contexts WHERE kind=?', 'standalone'); await this.meta(tx, 'active_context', standalone!.id);
  }); }
  /** Internal lifecycle primitive: never invoke from startup, errors or remote messages. */
  async clearContext(id: string, expectedRevision?: number): Promise<void> { await this.write(async tx => {
    const context = await this.context(id, tx); if (expectedRevision !== undefined && context.localRevision !== expectedRevision) throw new Error('Cache preview is stale.'); await this.recoveryCopyTx(tx, id, 'clear-cache');
    for (const stage of await tx.all<{ id: string }>('SELECT id FROM snapshots WHERE context_id=?', id)) await tx.run('DELETE FROM snapshot_records WHERE snapshot_id=?', stage.id);
    await tx.run('DELETE FROM snapshots WHERE context_id=?', id); await tx.run('DELETE FROM outbox WHERE context_id=?', id); await tx.run('DELETE FROM records WHERE context_id=?', id); await tx.run('DELETE FROM kv WHERE context_id=?', id);
    await tx.run('UPDATE contexts SET local_revision=local_revision+1,cursor=0,consent=0 WHERE id=?', id);
  }); }
}
