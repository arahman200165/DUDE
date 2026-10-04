import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { entityCollectionContract, kvRepositoryContract } from '@dude/persistence/testing';
import type { MobileEnrollmentAttempt, MobileHubEnrollment } from '../hub/types';
import type { SqlConnection, SqlDatabase, SqlValue } from './sql';
import { MobileStore } from './store';

class NodeSql implements SqlDatabase {
  readonly db: DatabaseSync;
  fail = false;
  private queue = Promise.resolve();
  constructor(file = ':memory:') { this.db = new DatabaseSync(file); }
  async exec(sql: string): Promise<void> { this.db.exec(sql); }
  async run(sql: string, ...values: SqlValue[]): Promise<void> { if (this.fail && sql.startsWith('INSERT INTO outbox')) throw new Error('SQLITE_FULL'); this.db.prepare(sql).run(...values); }
  async all<T>(sql: string, ...values: SqlValue[]): Promise<T[]> { return this.db.prepare(sql).all(...values) as T[]; }
  async first<T>(sql: string, ...values: SqlValue[]): Promise<T | null> { return this.db.prepare(sql).get(...values) as T ?? null; }
  async exclusive<T>(work: (tx: SqlConnection) => Promise<T>): Promise<T> {
    const previous = this.queue; let release!: () => void; this.queue = new Promise(resolve => { release = resolve; }); await previous;
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = await work(this); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { release(); }
  }
  async close(): Promise<void> { this.db.close(); }
}
let sequence = 0;
const databases: NodeSql[] = [];
const dirs: string[] = [];
const options = () => ({ deviceId: 'phone', id: () => `id-${++sequence}`, now: () => 1000 });
async function fixture(file?: string) {
  const db = new NodeSql(file); databases.push(db); const store = await MobileStore.open(db, options());
  return { db, store, context: await store.activeContext() };
}
const favorite = (targetId = 'unknown-tool', order = 0) => ({ id: `tool:${targetId}`, kind: 'tool' as const, targetId, order });
const attempt: MobileEnrollmentAttempt = { deviceId: 'phone', environmentId: 'environment', hubInstanceId: 'hub', authorityEpoch: 1, hubUrl: 'https://hub:47600', pins: ['pin'], keyRef: 'opaque-key', publicKey: 'public-key', displayName: 'Phone', mode: 'enroll', createdAt: 'now', spkiActive: 'pin', spkiNext: null, proxySpkis: [] };
const enrollment: MobileHubEnrollment = { ...attempt, keyId: null, registeredAt: 'now' };
async function enroll(store: MobileStore) { await store.savePendingAttempt(attempt); await store.commitEnrollment(enrollment); return store.activeContext(); }
async function consent(store: MobileStore) {
  const context = await enroll(store); await store.setCategories(context.id, { favorites: true, settings: true });
  const current = await store.context(context.id); const stage = await store.beginSnapshot(context.id, ['favorites', 'settings'], 0, 1);
  await store.stageSnapshotPage(stage, [], true); await store.commitSnapshot(stage, { expectedLocalRevision: current.localRevision, choices: { favorites: 'local', settings: 'local' } }); return store.context(context.id);
}
afterEach(async () => { for (const db of databases.splice(0)) { try { await db.close(); } catch { /* already closed restart fixture */ } } for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
kvRepositoryContract('Android SQLite', async () => { const { store, context } = await fixture(); return store.kvRepository(context.id); }, { describe, it, expect });
entityCollectionContract('Android favorites SQLite', async () => {
  const { store, context } = await fixture(); const repo = store.favoriteRepository(context.id);
  const adapt = (item: ReturnType<typeof favorite>) => ({ id: item.targetId, v: item.order });
  return {
    list: async () => (await repo.list()).map(adapt), get: async id => { const item = await repo.get(`tool:${id}`); return item ? adapt(item) : undefined; },
    upsert: value => repo.upsert(favorite(value.id, value.v)), remove: id => repo.remove(`tool:${id}`),
    importMany: values => repo.importMany(values.map(value => favorite(value.id, value.v))),
  };
}, { describe, it, expect });

describe('durable Android store', () => {
  it('survives a real database close/reopen and keeps stable installation identity', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dude-mobile-')); dirs.push(dir); const file = path.join(dir, 'cache.db');
    const first = await fixture(file); await first.store.favoriteRepository(first.context.id).upsert(favorite()); const identity = await first.store.installIdentity();
    await first.db.close(); const second = await fixture(file);
    expect(await second.store.favoriteRepository(second.context.id).list()).toEqual([favorite()]); expect((await second.store.pending(second.context.id)).length).toBe(1); expect(await second.store.installIdentity()).toEqual(identity);
  });
  it('rolls back the entity, revision and outbox on disk-full transaction failure', async () => {
    const { db, store, context } = await fixture(); db.fail = true;
    await expect(store.favoriteRepository(context.id).upsert(favorite())).rejects.toThrow('SQLITE_FULL');
    expect(await store.listRecords(context.id)).toEqual([]); expect(await store.pending(context.id)).toEqual([]); expect((await store.context(context.id)).localRevision).toBe(0);
  });
  it('coalesces unsent edits and safely cancels an unclaimed create/delete', async () => {
    const { store, context } = await fixture(); const repo = store.favoriteRepository(context.id);
    await repo.upsert(favorite()); await repo.upsert(favorite('unknown-tool', 4)); expect((await store.pending(context.id)).length).toBe(1);
    await repo.remove(favorite().id); expect(await store.pending(context.id)).toEqual([]); expect(await repo.list()).toEqual([]);
  });
  it('preserves newer edits and a delete when a claimed create has an uncertain response', async () => {
    const { store } = await fixture(); const context = await consent(store); const repo = store.favoriteRepository(context.id);
    await repo.upsert(favorite()); const [first] = await store.claimBatch(context.id, ['favorites']);
    await repo.upsert(favorite('unknown-tool', 4)); await repo.remove(favorite().id);
    expect((await store.pending(context.id)).map(op => op.opKind)).toEqual(['upsert', 'delete']);
    expect((await store.claimBatch(context.id, ['favorites'])).map(op => op.opId)).toEqual([first.opId]);
    await store.acknowledge(context.id, [{ opId: first.opId, status: 'applied', revision: 3 }]);
    expect(await repo.list()).toEqual([]); const [next] = await store.claimBatch(context.id, ['favorites']); expect(next.opKind).toBe('delete'); expect(next.basedOnRevision).toBe(3);
    await store.acknowledge(context.id, [{ opId: first.opId, status: 'duplicate', revision: 3 }]); expect((await store.pending(context.id)).length).toBe(1);
  });
  it('retains all edits at the shared 10000-row limit, including rollback of replacement state', async () => {
    const { store, db, context } = await fixture();
    await db.exclusive(async tx => { for (let i = 0; i < 10000; i++) await tx.run('INSERT INTO outbox(context_id,op_id,entity_type,entity_id,body) VALUES(?,?,?,?,?)', context.id, `seed-${i}`, 'favorite', `tool:${i}`, '{}'); });
    await expect(store.favoriteRepository(context.id).upsert(favorite())).rejects.toThrow('Pending edit limit'); expect(await store.listRecords(context.id)).toEqual([]); expect((await db.first<{ n: number }>('SELECT COUNT(*) n FROM outbox'))?.n).toBe(10000);
  });
  it('isolates standalone, enrolled and archived environment state', async () => {
    const { store, context } = await fixture(); await store.favoriteRepository(context.id).upsert(favorite('standalone'));
    const enrolled = await enroll(store); await store.favoriteRepository(enrolled.id).upsert(favorite('environment'));
    await store.archiveActive('disconnect'); expect((await store.activeContext()).id).toBe(context.id);
    expect((await store.favoriteRepository(context.id).list()).map(r => r.targetId)).toEqual(['standalone']);
    await expect(store.favoriteRepository(enrolled.id).upsert(favorite('blocked'))).rejects.toThrow('read-only');
    const nextAttempt = { ...attempt, environmentId: 'other-env', hubInstanceId: 'other-hub' }; await store.savePendingAttempt(nextAttempt); await store.commitEnrollment({ ...enrollment, ...nextAttempt });
    expect((await store.favoriteRepository((await store.activeContext()).id).list()).map(r => r.targetId)).toEqual(['standalone']);
  });
  it('refuses schema downgrades without changing the database', async () => {
    const db = new NodeSql(); databases.push(db); await db.exec('PRAGMA user_version=99'); await expect(MobileStore.open(db, options())).rejects.toThrow('downgrade'); expect((await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(99);
  });
  it('rejects secret settings and whitelists enrollment receipts without codes/proofs/tokens', async () => {
    const { db, store, context } = await fixture(); await expect(store.kvRepository(context.id).set('settings.ai', 'apiKey', 'secret', { policy: 'local', scope: 'device' })).rejects.toThrow('Keystore');
    await store.savePendingAttempt({ ...attempt, pairingCode: 'PRIVATE-CODE', token: 'PRIVATE-TOKEN', signature: 'PRIVATE-PROOF' } as MobileEnrollmentAttempt);
    const saved = await db.first<{ value: string }>('SELECT value FROM metadata WHERE key=?', 'pending_attempt'); expect(saved?.value).not.toContain('PRIVATE');
    await store.commitEnrollment(enrollment); expect(await store.readPendingAttempt()).toBeNull(); expect((await store.readEnrollment())?.keyId).toBeNull();
    expect(JSON.stringify(await store.exportRecovery((await store.activeContext()).id))).not.toMatch(/opaque-key|public-key|keyRef|keyId|PRIVATE/);
  });
  it('keeps raw unsupported appearance choices while enforcing shared setting scopes', async () => {
    const { store, context } = await fixture(); const kv = store.kvRepository(context.id); const raw = { theme: 'dark', uiFont: 'future-font', futureAxis: { choice: true } };
    await kv.set('settings', 'appearance', raw, { policy: 'local', scope: 'environment' }); expect(await kv.get('settings', 'appearance')).toEqual(raw);
    await expect(kv.set('settings.ai', 'model', 'private', { policy: 'local', scope: 'environment' })).rejects.toThrow('scope');
  });
  it('binds previews to local revision, recovers Use Hub, and uses the first snapshot cursor', async () => {
    const { store } = await fixture(); const context = await consent(store); await store.favoriteRepository(context.id).upsert(favorite());
    const stage = await store.beginSnapshot(context.id, ['favorites'], 0, 1); const revision = (await store.context(context.id)).localRevision;
    await store.stageSnapshotPage(stage, [{ entityType: 'favorite', entityId: favorite().id, payload: favorite('unknown-tool', 7), deleted: false, revision: 5, schemaVersion: 1, updatedAt: 'now', updatedByDeviceId: 'desktop' }], true, 5);
    expect((await store.stagedSnapshot(stage)).cursor).toBe(0);
    await store.commitSnapshot(stage, { choices: { favorites: 'hub' }, expectedLocalRevision: revision }); expect((await store.favoriteRepository(context.id).get(favorite().id))?.order).toBe(7); expect((await store.context(context.id)).cursor).toBe(0); expect((await store.recoveryCopies(context.id)).length).toBe(1);
    const stale = await store.beginSnapshot(context.id, ['favorites'], 5, 1); await store.stageSnapshotPage(stale, [], true); await store.favoriteRepository(context.id).upsert(favorite('new'));
    await expect(store.commitSnapshot(stale, { choices: { favorites: 'hub' }, expectedLocalRevision: revision })).rejects.toThrow('stale');
  });
  it('reconciles an expired cursor without deleting or re-keying pending operations', async () => {
    const { store } = await fixture(); const context = await consent(store); await store.favoriteRepository(context.id).upsert(favorite()); const before = await store.pending(context.id);
    const stage = await store.beginSnapshot(context.id, ['favorites'], 10, 1); await store.stageSnapshotPage(stage, [], true);
    await store.commitSnapshot(stage, { choices: { favorites: 'merge' }, expectedLocalRevision: (await store.context(context.id)).localRevision, preservePending: true });
    expect(await store.pending(context.id)).toEqual(before); expect(await store.favoriteRepository(context.id).list()).toEqual([favorite()]);
    await expect(store.applyChanges(context.id, [], 9, 9, 1)).rejects.toThrow('regressed'); expect((await store.context(context.id)).cursor).toBe(10);
  });
  it('applies records and cursor atomically and stops categories without deleting queued edits', async () => {
    const { store } = await fixture(); const context = await consent(store); await store.favoriteRepository(context.id).upsert(favorite());
    await store.setCategories(context.id, { favorites: false, settings: true }); expect(await store.claimBatch(context.id, ['favorites'])).toEqual([]); expect((await store.pending(context.id)).length).toBe(1);
    await expect(store.applyChanges(context.id, [{ entityType: 'favorite', entityId: favorite().id, payload: favorite(), deleted: false, revision: 1, schemaVersion: 1, updatedAt: 'now', updatedByDeviceId: null }], 1, 1, 1)).rejects.toThrow('unapproved'); expect((await store.context(context.id)).cursor).toBe(0);
    await store.setCategories(context.id, { favorites: true, settings: true }); expect((await store.context(context.id)).consent).toBe(false);
  });
  it('re-pairs retained state and permits only exact uncertain replay before fresh consent', async () => {
    const { store } = await fixture(); const context = await consent(store); await store.favoriteRepository(context.id).upsert(favorite());
    const [claimed] = await store.claimBatch(context.id, ['favorites']); await store.archiveActive('disconnect');
    const archived = await store.exportRecovery(context.id); expect(archived.authority?.hubInstanceId).toBe('hub');
    await store.activateArchiveForPairing(context.id); const repair = { ...attempt, mode: 'reconnect' as const, keyRef: 'fresh-key', hubInstanceId: 'restored-hub', authorityEpoch: 2 };
    await store.savePendingAttempt(repair); await store.commitEnrollment({ ...enrollment, ...repair });
    expect((await store.activeContext()).id).toBe(context.id); expect((await store.context(context.id)).consent).toBe(false);
    expect(await store.claimBatch(context.id, ['favorites'])).toEqual([]);
    expect((await store.claimBatch(context.id, ['favorites'], 100, true)).map(op => op.opId)).toEqual([claimed.opId]);
    await store.acknowledge(context.id, [{ opId: claimed.opId, status: 'duplicate', revision: 1 }]); expect(await store.favoriteRepository(context.id).list()).toEqual([favorite()]);
  });
  it('imports credential-free recovery into an isolated archive and preserves device and operation IDs', async () => {
    const source = await fixture(); const context = await consent(source.store); await source.store.favoriteRepository(context.id).upsert(favorite());
    const exported = await source.store.exportRecovery(context.id); const target = await fixture(); const id = await target.store.importRecovery(JSON.stringify(exported));
    expect((await target.store.context(id)).kind).toBe('archive'); expect((await target.store.context(id)).deviceId).toBe('phone');
    expect((await target.store.exportRecovery(id)).authority).toEqual(exported.authority); expect((await target.store.pending(id)).map(op => op.opId)).toEqual(exported.pending.map(op => op.opId));
    await expect(target.store.favoriteRepository(id).upsert(favorite('blocked'))).rejects.toThrow('read-only');
    await target.store.convertArchiveToStandalone(id, exported.context.localRevision);
    expect(await target.store.favoriteRepository((await target.store.activeContext()).id).list()).toEqual([favorite()]); expect((await target.store.pending(id)).length).toBe(1);
    await expect(target.store.importRecovery(JSON.stringify({ ...exported, keyRef: 'secret' }))).rejects.toThrow('Invalid recovery');
  });
  it('rejects stale clear previews atomically without removing pending data', async () => {
    const { store, context } = await fixture(); await store.favoriteRepository(context.id).upsert(favorite()); const expected = (await store.context(context.id)).localRevision;
    await store.favoriteRepository(context.id).upsert(favorite('later'));
    await expect(store.clearContext(context.id, expected)).rejects.toThrow('stale'); expect((await store.pending(context.id)).length).toBe(2);
  });
});
