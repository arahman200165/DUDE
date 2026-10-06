import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HubRequest, HubResponse } from '@dude/api-client';
import type { SyncOp, SyncOpResult, SyncRecord } from '@dude/contracts/hub';
import { categoryOf } from '@dude/sync';
import { MobileStore } from '../storage/store';
import type { SqlConnection, SqlDatabase, SqlValue } from '../storage/sql';
import type { MobileEnrollmentAttempt, MobileHubEnrollment, MobileHubPorts, MobileSigner } from '../hub/types';
import { MobileDeviceSession } from '../hub/session';
import { MobileHubError } from '../hub/types';
import { MobileSyncDriver, type SyncDriverState } from './driver';
import { DurableWorkbench } from '../state/durable-backend';

export class TestSql implements SqlDatabase {
  readonly db: DatabaseSync;
  private queue = Promise.resolve();
  private closed = false;
  constructor(file = ':memory:') { this.db = new DatabaseSync(file); }
  async exec(sql: string): Promise<void> { this.db.exec(sql); }
  async run(sql: string, ...values: SqlValue[]): Promise<void> { this.db.prepare(sql).run(...values); }
  async all<T>(sql: string, ...values: SqlValue[]): Promise<T[]> { return this.db.prepare(sql).all(...values) as T[]; }
  async first<T>(sql: string, ...values: SqlValue[]): Promise<T | null> { return this.db.prepare(sql).get(...values) as T ?? null; }
  async exclusive<T>(work: (tx: SqlConnection) => Promise<T>): Promise<T> {
    const previous = this.queue; let release!: () => void; this.queue = new Promise(resolve => { release = resolve; }); await previous;
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = await work(this); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; } finally { release(); }
  }
  async close(): Promise<void> { if (!this.closed) { this.closed = true; this.db.close(); } }
}
const NOW = Date.parse('2026-10-04T12:00:00.000Z');
const pin = 'A'.repeat(43);
const DEVICE = '22222222-2222-4222-8222-222222222222';
const ENV = '33333333-3333-4333-8333-333333333333';
const HUB = '11111111-1111-4111-8111-111111111111';
const favorite = (targetId: string, order = 0) => ({ id: `tool:${targetId}`, kind: 'tool' as const, targetId, order });
const receipt: MobileEnrollmentAttempt = { deviceId: DEVICE, environmentId: ENV, hubInstanceId: HUB, authorityEpoch: 1, hubUrl: 'https://hub:47600', pins: [pin], keyRef: 'opaque-key', publicKey: 'B'.repeat(43), displayName: 'Phone', mode: 'enroll', createdAt: new Date(NOW).toISOString(), spkiActive: pin, spkiNext: null, proxySpkis: [] };
const enrollment: MobileHubEnrollment = { ...receipt, keyId: null, registeredAt: new Date(NOW).toISOString() };
const ok = (body: unknown): HubResponse => ({ status: 200, headers: {}, body });
export class TestHub {
  readonly requests: HubRequest[] = [];
  readonly records = new Map<string, SyncRecord>();
  readonly applied = new Map<string, number>();
  head = 0; floor = 0; epoch = 1; instance = HUB;
  dropPush = false;
  onPush: (() => Promise<void>) | null = null;
  onSnapshot: (() => void) | null = null;
  onChanges: (() => Promise<void>) | null = null;
  write(type: string, id: string, payload: unknown, deleted = false): SyncRecord {
    const record = { entityType: type, entityId: id, payload: deleted ? null : payload, deleted, revision: ++this.head, schemaVersion: 1, updatedAt: new Date(NOW).toISOString(), updatedByDeviceId: DEVICE };
    this.records.set(`${type}/${id}`, record); return record;
  }
  async request(request: HubRequest): Promise<HubResponse> {
    this.requests.push(structuredClone(request));
    const url = new URL(request.path, 'https://hub'); const endpoint = url.pathname.slice('/api/v1'.length);
    if (endpoint === '/hello') return ok({ service: 'dude-hub', protocolVersion: 2, minClientProtocol: 1, hubVersion: 'test', hubInstanceId: this.instance, environmentId: ENV, bootstrapped: true, tls: { spkiSha256: pin, nextSpkiSha256: null }, authorityEpoch: this.epoch, authorityState: 'active', syncCategoryFiltering: true });
    if (endpoint === '/tls/certificates') return ok({ active: { spkiSha256: pin, certPem: 'certificate' }, next: null, source: 'self-signed', caCertPem: null, leafNotAfter: '2030-01-01' });
    if (endpoint === '/auth/device/challenge') return ok({ nonce: 'N'.repeat(43), expiresAt: new Date(NOW + 60_000).toISOString() });
    if (endpoint === '/auth/device/token') return ok({ accessToken: `ddt_${'T'.repeat(43)}`, expiresAt: new Date(NOW + 900_000).toISOString(), authorityEpoch: this.epoch });
    if (endpoint === '/sync/push') {
      const ops = (request.body as { ops: SyncOp[] }).ops; const results: SyncOpResult[] = [];
      for (const op of ops) {
        const previous = this.applied.get(op.opId);
        if (previous !== undefined) results.push({ opId: op.opId, status: 'duplicate', revision: previous });
        else { const record = this.write(op.entityType, op.entityId, op.payload, op.opKind === 'delete'); this.applied.set(op.opId, record.revision); results.push({ opId: op.opId, status: 'applied', revision: record.revision }); }
      }
      await this.onPush?.();
      if (this.dropPush) { this.dropPush = false; throw new Error('Acknowledgement was lost.'); }
      return ok({ results, headRevision: this.head });
    }
    if (endpoint === '/sync/changes' || endpoint === '/sync/snapshot') {
      const categories = url.searchParams.get('categories')?.split(',');
      if (!categories?.length) throw new Error('Android issued an unfiltered read.');
      const limit = Number(url.searchParams.get('limit') ?? 16);
      if (limit > 16) throw new Error('Android exceeded its page limit.');
      let records = [...this.records.values()].filter(record => categories.includes(categoryOf(record.entityType)!));
      if (endpoint === '/sync/changes') {
        await this.onChanges?.();
        const after = Number(url.searchParams.get('after'));
        if (after < this.floor) return { status: 410, headers: {}, body: { error: { code: 'cursor-expired', message: 'Take a snapshot.' } } };
        records = records.filter(record => record.revision > after).sort((a, b) => a.revision - b.revision);
        const changes = records.slice(0, limit); const hasMore = records.length > limit;
        return ok({ changes, cursor: hasMore ? changes.at(-1)!.revision : this.head, hasMore, floor: this.floor, headRevision: this.head, authorityEpoch: this.epoch });
      }
      this.onSnapshot?.();
      const type = url.searchParams.get('afterType'); const id = url.searchParams.get('afterId') ?? '';
      records = records.filter(record => !record.deleted && (type === null || record.entityType > type || record.entityType === type && record.entityId > id))
        .sort((a, b) => a.entityType < b.entityType ? -1 : a.entityType > b.entityType ? 1 : a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0);
      const page = records.slice(0, limit); const last = page.at(-1);
      return ok({ records: page, asOfRevision: this.head, next: records.length > limit && last ? { afterType: last.entityType, afterId: last.entityId } : null, floor: this.floor, authorityEpoch: this.epoch });
    }
    if (endpoint === '/sync/state') return ok({ headRevision: this.head, floor: this.floor, retentionDays: 90, authorityEpoch: this.epoch });
    throw new Error(`Unexpected request: ${request.path}`);
  }
}
const signer: MobileSigner = {
  prepareKey: async () => 'opaque-key', publicKey: async () => 'B'.repeat(43), signEnrollment: async () => 'S'.repeat(86),
  signChallenge: async () => 'S'.repeat(86), deleteKey: async () => undefined, randomBytes: async () => 'R'.repeat(43),
};
const cleanup: Array<() => Promise<void>> = [];
let sequence = 0;
export async function syncFixture(options: { file?: string; hub?: TestHub; consent?: boolean; reopen?: boolean } = {}) {
  const database = new TestSql(options.file); const id = () => `id-${++sequence}`;
  cleanup.push(() => database.close());
  const store = await MobileStore.open(database, { deviceId: DEVICE, id, now: () => NOW });
  const hub = options.hub ?? new TestHub();
  if (!options.reopen) { await store.savePendingAttempt(receipt); await store.commitEnrollment(enrollment); }
  const context = await store.activeContext();
  if (options.consent !== false && !context.consent) {
    await store.setCategories(context.id, { favorites: true, settings: true });
    const stage = await store.beginSnapshot(context.id, ['favorites', 'settings'], hub.head, 1);
    await store.stageSnapshotPage(stage, [...hub.records.values()], true);
    await store.commitSnapshot(stage, { choices: { favorites: 'merge', settings: 'merge' }, expectedLocalRevision: (await store.context(context.id)).localRevision });
  }
  const ports: MobileHubPorts = { persistence: store, signer, certificatePin: async () => pin, transport: () => hub, now: () => NOW };
  const session = new MobileDeviceSession(ports, enrollment);
  const states: SyncDriverState[] = [];
  const driver = new MobileSyncDriver({ store, session, contextId: context.id, id, now: () => NOW, onState: state => states.push(state) });
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await driver.stop(); await database.close(); } };
  cleanup.push(close);
  return { store, database, hub, ports, driver, context, states, id, close };
}
afterEach(async () => { while (cleanup.length) await cleanup.pop()!(); vi.useRealTimers(); });

describe('Android sync driver with real SQLite and contract-shaped Hub', () => {
  it('durably claims before transport, restarts and replays exactly the same operation after a lost acknowledgement', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'mobile-sync-')); const file = path.join(directory, 'device.db');
    try {
      const first = await syncFixture({ file });
      await first.store.favoriteRepository(first.context.id).upsert(favorite('json'));
      const opId = (await first.store.pending(first.context.id))[0]!.opId;
      first.hub.onPush = async () => { expect((await first.store.pending(first.context.id))[0]).toMatchObject({ opId, claimed: true }); };
      first.hub.dropPush = true;
      await first.driver.setForeground(true);
      expect(first.driver.getState().phase).toBe('offline');
      expect(first.hub.applied.size).toBe(1);
      first.hub.onPush = null;
      await first.close();
      const second = await syncFixture({ file, hub: first.hub, reopen: true });
      await second.driver.setForeground(true);
      expect(await second.store.pending(second.context.id)).toEqual([]);
      const requests = second.hub.requests.filter(request => request.path.endsWith('/sync/push'));
      expect(requests.map(request => (request.body as { ops: SyncOp[] }).ops[0]!.opId)).toEqual([opId, opId]);
      expect(second.hub.applied.size).toBe(1);
      expect(await second.store.favoriteRepository(second.context.id).list()).toEqual([favorite('json')]);
      await second.close();
    } finally { while (cleanup.length) await cleanup.pop()!(); rmSync(directory, { recursive: true, force: true }); }
  });

  it('an old acknowledgement preserves a newer local edit and sends it under a distinct durable operation', async () => {
    const f = await syncFixture(); await f.store.favoriteRepository(f.context.id).upsert(favorite('json', 1));
    const old = (await f.store.pending(f.context.id))[0]!.opId;
    f.hub.onPush = async () => { f.hub.onPush = null; await f.store.favoriteRepository(f.context.id).upsert(favorite('json', 2)); };
    await f.driver.setForeground(true);
    const pending = await f.store.pending(f.context.id);
    expect(pending).toHaveLength(1); expect(pending[0]!.opId).not.toBe(old);
    expect(await f.store.favoriteRepository(f.context.id).list()).toEqual([favorite('json', 2)]);
    await f.driver.syncNow();
    expect(await f.store.pending(f.context.id)).toEqual([]);
    expect(f.hub.records.get('favorite/tool:json')!.payload).toEqual(favorite('json', 2));
  });

  it('previews never upload uncertain deliveries; explicit approval replays only claimed operations and asks for a refreshed choice when the head changes', async () => {
    const f = await syncFixture();
    await f.store.favoriteRepository(f.context.id).upsert(favorite('uncertain'));
    f.hub.dropPush = true; await f.driver.setForeground(true); await f.driver.quiesce();
    const claimedId = (await f.store.pending(f.context.id))[0]!.opId;
    // Model an ambiguous request that did not survive on the remote authority.
    f.hub.head = 0; f.hub.records.clear(); f.hub.applied.clear();
    await f.store.savePendingAttempt({ ...receipt, mode: 'reconnect', keyRef: 'new-key' });
    await f.store.commitEnrollment({ ...enrollment, keyRef: 'new-key' });
    await f.driver.stop();
    const repairedDriver = new MobileSyncDriver({ store: f.store, session: new MobileDeviceSession(f.ports, (await f.store.readEnrollment())!),
      contextId: f.context.id, id: f.id, now: () => NOW, onState: state => f.states.push(state) });
    cleanup.push(() => repairedDriver.stop());
    await f.store.favoriteRepository(f.context.id).upsert(favorite('fresh-local'));
    await repairedDriver.setForeground(true); await repairedDriver.preview();
    expect(f.hub.requests.filter(request => request.path.endsWith('/sync/push'))).toHaveLength(1);
    const preview = repairedDriver.getState().preview!;
    await expect(repairedDriver.approve({ favorites: 'merge', settings: 'local' }, preview.id)).rejects.toThrow('refreshed');
    const pushes = f.hub.requests.filter(request => request.path.endsWith('/sync/push'));
    expect((pushes[1]!.body as { ops: SyncOp[] }).ops.map(op => op.opId)).toEqual([claimedId]);
    expect((await f.store.context(f.context.id)).consent).toBe(false);
    await repairedDriver.approve({ favorites: 'merge', settings: 'local' }, repairedDriver.getState().preview!.id);
    expect(f.hub.records.get('favorite/tool:fresh-local')!.payload).toEqual(favorite('fresh-local'));
  });

  it('Use local publishes local overlap values and retains Hub-only records', async () => {
    const f = await syncFixture({ consent: false });
    await f.store.favoriteRepository(f.context.id).upsert(favorite('overlap', 2));
    f.hub.write('favorite', 'tool:overlap', favorite('overlap', 9));
    f.hub.write('favorite', 'tool:remote-only', favorite('remote-only'));
    await f.driver.setForeground(true); await f.driver.setCategory('favorites', true);
    await f.driver.approve({ favorites: 'local' }, f.driver.getState().preview!.id);
    expect(f.hub.records.get('favorite/tool:overlap')!.payload).toEqual(favorite('overlap', 2));
    expect(await f.store.favoriteRepository(f.context.id).get('tool:remote-only')).toEqual(favorite('remote-only'));
  });

  it('issues no reads with both categories disabled and re-enabling a category takes its old records through a new preview', async () => {
    const f = await syncFixture({ consent: false });
    f.hub.write('favorite', 'tool:json', favorite('json'));
    f.hub.write('setting', 'settings:appearance', { namespace: 'settings', key: 'appearance', value: { mode: 'light', futureField: 'keep' } });
    await f.driver.setForeground(true);
    expect(f.hub.requests.filter(request => request.path.includes('/sync/'))).toEqual([]);
    await f.driver.setCategory('favorites', true);
    const preview = f.driver.getState().preview!;
    expect(preview.categories).toEqual([{ category: 'favorites', localCount: 0, hubCount: 1 }]);
    await f.driver.approve({ favorites: 'merge' }, preview.id);
    expect(await f.store.favoriteRepository(f.context.id).list()).toEqual([favorite('json')]);
    expect(await f.store.kvRepository(f.context.id).get('settings', 'appearance')).toBeUndefined();
    await f.driver.setCategory('settings', true);
    const second = f.driver.getState().preview!;
    await f.driver.approve({ favorites: 'merge', settings: 'merge' }, second.id);
    expect(await f.store.kvRepository(f.context.id).get('settings', 'appearance')).toEqual({ mode: 'light', futureField: 'keep' });
    expect(f.hub.requests.filter(request => request.path.includes('/sync/changes')).every(request => new URL(request.path, 'https://hub').searchParams.has('categories'))).toBe(true);
  });

  it('Merge preserves a union, Hub wins overlaps, and Use Hub requires a choice-bound separate confirmation with a recovery copy', async () => {
    const f = await syncFixture({ consent: false });
    await f.store.favoriteRepository(f.context.id).importMany([favorite('local'), favorite('overlap', 1)]);
    f.hub.write('favorite', 'tool:remote', favorite('remote'));
    f.hub.write('favorite', 'tool:overlap', favorite('overlap', 9));
    await f.driver.setForeground(true); await f.driver.setCategory('favorites', true);
    await f.driver.approve({ favorites: 'merge' }, f.driver.getState().preview!.id);
    expect((await f.store.favoriteRepository(f.context.id).list()).map(item => [item.targetId, item.order])).toEqual([['local', 0], ['overlap', 9], ['remote', 0]]);
    await f.store.favoriteRepository(f.context.id).upsert(favorite('extra'));
    await f.driver.preview(); const id = f.driver.getState().preview!.id;
    await expect(f.driver.approve({ favorites: 'hub' }, id)).rejects.toThrow('confirmation');
    const permit = await f.driver.previewApproval({ favorites: 'hub' }, id);
    await expect(f.driver.approve({ favorites: 'hub', settings: 'local' }, id, permit.token)).rejects.toThrow('confirmation');
    const freshPermit = await f.driver.previewApproval({ favorites: 'hub' }, id);
    await f.driver.approve({ favorites: 'hub' }, id, freshPermit.token);
    expect((await f.store.favoriteRepository(f.context.id).list()).some(item => item.targetId === 'extra')).toBe(false);
    expect((await f.store.recoveryCopies(f.context.id)).some(copy => copy.reason === 'use-hub')).toBe(true);
    await expect(f.driver.approve({ favorites: 'hub' }, id, freshPermit.token)).rejects.toThrow('preview');
  });

  it('refuses stale local, category or Hub-head preview approval before changing records', async () => {
    const f = await syncFixture({ consent: false });
    await f.driver.setForeground(true); await f.driver.setCategory('favorites', true);
    const first = f.driver.getState().preview!.id;
    await f.store.favoriteRepository(f.context.id).upsert(favorite('local'));
    await expect(f.driver.approve({ favorites: 'merge' }, first)).rejects.toThrow('preview');
    await f.driver.preview(); const second = f.driver.getState().preview!.id;
    f.hub.write('favorite', 'tool:remote', favorite('remote'));
    await expect(f.driver.approve({ favorites: 'merge' }, second)).rejects.toThrow('Hub changed');
    expect((await f.store.context(f.context.id)).consent).toBe(false);
    expect(await f.store.favoriteRepository(f.context.id).list()).toEqual([favorite('local')]);
  });

  it('restarts consent snapshot pagination when Hub head changes instead of merging a missed overlap', async () => {
    const f = await syncFixture({ consent: false });
    await f.store.favoriteRepository(f.context.id).upsert(favorite('000', 1));
    for (let n = 0; n < 20; n++) f.hub.write('favorite', `tool:${String(n).padStart(3, '0')}`, favorite(String(n).padStart(3, '0'), 9));
    let snapshots = 0;
    f.hub.onSnapshot = () => { if (++snapshots === 2) f.hub.write('favorite', 'tool:000', favorite('000', 10)); };
    await f.driver.setForeground(true); await f.driver.setCategory('favorites', true);
    expect(snapshots).toBeGreaterThan(2);
    await f.driver.approve({ favorites: 'merge' }, f.driver.getState().preview!.id);
    expect(await f.store.favoriteRepository(f.context.id).get('tool:000')).toEqual(favorite('000', 10));
  });

  it('410 reconciliation keeps local pending edits and uses the first snapshot cursor to catch an insertion behind the keyset', async () => {
    const f = await syncFixture();
    for (let n = 1; n <= 20; n++) f.hub.write('favorite', `tool:${String(n).padStart(3, '0')}`, favorite(String(n).padStart(3, '0')));
    f.hub.floor = 10;
    let snapshots = 0;
    f.hub.onSnapshot = () => { if (++snapshots === 2) f.hub.write('favorite', 'tool:000', favorite('000')); };
    await f.store.favoriteRepository(f.context.id).upsert(favorite('local'));
    // Drop the first push ack so a claimed request survives into the next round.
    f.hub.dropPush = true; await f.driver.setForeground(true);
    expect((await f.store.pending(f.context.id))[0]!.claimed).toBe(true);
    await f.driver.syncNow();
    expect(await f.store.pending(f.context.id)).toEqual([]);
    expect((await f.store.favoriteRepository(f.context.id).list()).some(item => item.targetId === '000')).toBe(true);
    expect((await f.store.favoriteRepository(f.context.id).list()).some(item => item.targetId === 'local')).toBe(true);
    expect((await f.store.context(f.context.id)).cursor).toBe(f.hub.head);
  });

  it.each(['epoch', 'instance', 'head'])('blocks %s regression and makes no further automatic Hub calls', async field => {
    const f = await syncFixture(); await f.store.favoriteRepository(f.context.id).upsert(favorite('json')); await f.driver.setForeground(true);
    if (field === 'epoch') f.hub.epoch = 2; else if (field === 'instance') f.hub.instance = '99999999-9999-4999-8999-999999999999'; else f.hub.head = 0;
    await f.driver.syncNow(); expect(f.driver.getState().failure).toBe('authority');
    const requests = f.hub.requests.length; await f.driver.syncNow(); await f.driver.setForeground(false); await f.driver.setForeground(true);
    expect(f.hub.requests.length).toBe(requests);
    expect(await f.store.favoriteRepository(f.context.id).list()).toEqual([favorite('json')]);
  });

  it('single-flights concurrent invalidations, ignores a suspended response and resumes from the unchanged cursor', async () => {
    const f = await syncFixture();
    let release!: () => void; let arrived!: () => void; const entered = new Promise<void>(resolve => { arrived = resolve; });
    const barrier = new Promise<void>(resolve => { release = resolve; });
    f.hub.onChanges = async () => { f.hub.onChanges = null; arrived(); await barrier; };
    const running = f.driver.setForeground(true); await entered;
    const concurrent = f.driver.syncNow();
    await f.driver.setForeground(false); release(); await Promise.all([running, concurrent]);
    expect((await f.store.context(f.context.id)).cursor).toBe(0);
    const reads = f.hub.requests.filter(request => request.path.includes('/sync/changes')).length;
    await f.driver.syncNow(); expect(f.hub.requests.filter(request => request.path.includes('/sync/changes'))).toHaveLength(reads);
    f.hub.write('favorite', 'tool:remote', favorite('remote')); await f.driver.setForeground(true);
    expect((await f.store.context(f.context.id)).cursor).toBe(1);
  });

  it('bounds each foreground pull to sixteen pages and resumes a large catch-up', async () => {
    const f = await syncFixture();
    for (let n = 0; n < 300; n++) f.hub.write('favorite', `tool:${n}`, favorite(String(n)));
    await f.driver.setForeground(true);
    expect(f.hub.requests.filter(request => request.path.includes('/sync/changes'))).toHaveLength(16);
    expect((await f.store.context(f.context.id)).cursor).toBe(256);
    await f.driver.syncNow(); expect((await f.store.context(f.context.id)).cursor).toBe(300);
  });

  it('durable backend preserves unknown appearance fields and desktop-only favorite references', async () => {
    const f = await syncFixture({ consent: false });
    const backend = new DurableWorkbench({ store: f.store, ports: f.ports, installId: 'install', deviceId: DEVICE, appVersion: '0.0.0', now: () => NOW, id: f.id });
    await backend.start();
    await f.store.kvRepository(f.context.id).set('settings', 'appearance', { mode: 'dark', uiFont: { custom: 'Desktop Font' }, futureField: { keep: true } }, { policy: 'local', scope: 'environment' });
    await expect(backend.actions.patchAppearance({ mode: 'light' })).resolves.toMatchObject({ ok: true });
    await backend.actions.setFavorite({ id: 'pipeline:desktop', kind: 'pipeline', targetId: 'desktop', order: 99 }, true);
    expect(backend.getSnapshot().appearance).toEqual({ mode: 'light', uiFont: { custom: 'Desktop Font' }, futureField: { keep: true } });
    expect(backend.getSnapshot().favorites[0]!.targetId).toBe('desktop');
    expect(backend.getSnapshot().durability).toBe('durable');
    expect((await f.store.pending(f.context.id)).length).toBe(2);
    await backend.driver?.stop(); backend.session?.clear();
  });

  it('production backend checks a restored native key locally and makes its cache read-only without contacting the Hub', async () => {
    const f = await syncFixture({ consent: false });
    await f.store.favoriteRepository(f.context.id).upsert(favorite('local'));
    const backend = new DurableWorkbench({ store: f.store, ports: { ...f.ports, signer: { ...signer, publicKey: async () => { throw new MobileHubError('key-unavailable', 'Android Keystore material is missing.'); } } },
      installId: 'install', deviceId: DEVICE, appVersion: '0.0.0', now: () => NOW, id: f.id });
    await backend.start(); await backend.setForeground(true);
    expect(f.hub.requests).toEqual([]);
    expect((await f.store.context(f.context.id)).writable).toBe(false);
    expect(await f.store.failureState(f.context.id)).toBe('missing-key');
    expect(backend.getSnapshot().connection.kind).toBe('reauth-required');
    expect(backend.getSnapshot().capabilities.favorites).toBe(false);
    expect(await f.store.pending(f.context.id)).toHaveLength(1);
    expect((await backend.actions.setFavorite(favorite('blocked'), true)).ok).toBe(false);
    await backend.changed();
    expect(backend.getSnapshot().connection.kind).toBe('reauth-required');
    expect(f.hub.requests).toEqual([]);
    await backend.close();
  });
  it('takes over a committed re-pair identity after old-key cleanup fails and retries the durable cleanup', async () => {
    const f = await syncFixture();
    await f.store.favoriteRepository(f.context.id).upsert(favorite('preserved'));
    let cleanupFails = true;
    const deleted: string[] = [];
    const backend = new DurableWorkbench({ store: f.store, ports: { ...f.ports, signer: { ...signer,
      prepareKey: async () => 'fresh-key', deleteKey: async key => { deleted.push(key); if (cleanupFails) throw new Error('Native key deletion failed.'); },
    }, transport: target => ({ request: request => request.path.endsWith('/devices/enroll')
      ? Promise.resolve(ok({ deviceId: DEVICE, environmentId: ENV, hubInstanceId: HUB, keyId: 'new-key-id', registeredAt: new Date(NOW).toISOString(), hubRevision: 0 }))
      : f.ports.transport(target).request(request) }) },
      installId: 'install', deviceId: DEVICE, appVersion: '0.0.0', now: () => NOW, id: f.id });
    await backend.start(); await backend.setForeground(true);
    const previousSession = backend.session!;
    const result = await backend.actions.rePair({ pairingString: `dude-pair:v1:hub:47600:01234567:${pin}`, displayName: 'Phone', acknowledged: true });
    expect(result).toMatchObject({ ok: false, reason: 'Native key deletion failed.' });
    expect((await f.store.readEnrollment())?.keyRef).toBe('fresh-key');
    expect(await f.store.readPendingAttempt()).toBeNull();
    expect(backend.session?.getEnrollment().keyRef).toBe('fresh-key');
    await expect(previousSession.token()).rejects.toThrow('closed');
    expect(backend.getSnapshot().recovery.warning).toMatch(/old signing key could not be deleted/);
    expect(await f.store.pendingKeyCleanup()).toEqual(['opaque-key']);
    expect(await f.store.favoriteRepository(f.context.id).list()).toEqual([favorite('preserved')]);
    cleanupFails = false;
    expect(await backend.actions.recover()).toMatchObject({ ok: true });
    expect(await f.store.pendingKeyCleanup()).toEqual([]);
    expect(backend.getSnapshot().recovery.warning).toBeUndefined();
    expect(deleted.every(key => key === 'opaque-key')).toBe(true);
    await backend.close();
  });
});
