import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { SyncRecord, SyncOp } from '@dude/contracts/hub';
import { MobileStore } from '../apps/mobile/src/storage/store';
import type { SqlConnection, SqlDatabase, SqlValue } from '../apps/mobile/src/storage/sql';
import type { MobileDeviceSession } from '../apps/mobile/src/hub/session';
import type { MobileHubEnrollment } from '../apps/mobile/src/hub/types';
import { MobileSyncDriver } from '../apps/mobile/src/sync/driver';

// Host benchmark of the actual Android driver and disk SQLite. Authentication,
// native bridge, network latency and Android hardware are deliberately unmeasured.
class Sql implements SqlDatabase {
  constructor(readonly db: DatabaseSync) {}
  async exec(sql: string) { this.db.exec(sql); }
  async run(sql: string, ...values: SqlValue[]) { this.db.prepare(sql).run(...values); }
  async all<T>(sql: string, ...values: SqlValue[]) { return this.db.prepare(sql).all(...values) as T[]; }
  async first<T>(sql: string, ...values: SqlValue[]) { return this.db.prepare(sql).get(...values) as T ?? null; }
  async exclusive<T>(work: (tx: SqlConnection) => Promise<T>) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = await work(this); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async close() { this.db.close(); }
}
mkdirSync('tmp/mobile-measurements', { recursive: true });
const directory = mkdtempSync(path.resolve('tmp/mobile-measurements/host-'));
const file = path.join(directory, 'device.db');
const sql = new Sql(new DatabaseSync(file));
let sequence = 0;
const store = await MobileStore.open(sql, { deviceId: 'measurement-device', id: () => `measurement-${++sequence}`, now: Date.now });
const enrollment = { deviceId: 'measurement-device', environmentId: 'measurement-env', hubInstanceId: 'measurement-hub', authorityEpoch: 1,
  keyRef: 'fixture-not-a-credential', publicKey: 'fixture', keyId: null, registeredAt: new Date().toISOString(), hubUrl: 'https://fixture.invalid',
  pins: ['fixture'], spkiActive: 'fixture', spkiNext: null, proxySpkis: [] } satisfies MobileHubEnrollment;
await store.savePendingAttempt({ ...enrollment, mode: 'enroll', displayName: 'Measurement', createdAt: new Date().toISOString() });
await store.commitEnrollment(enrollment);
const context = await store.activeContext();
await store.setCategories(context.id, { favorites: true, settings: false });
const stage = await store.beginSnapshot(context.id, ['favorites'], 0, 1);
await store.stageSnapshotPage(stage, [], true);
await store.commitSnapshot(stage, { choices: { favorites: 'merge' }, expectedLocalRevision: (await store.context(context.id)).localRevision });
const records: SyncRecord[] = [];
let head = 0, pulls = 0, pushes = 0;
function record(id: string, payload: unknown, deleted = false): SyncRecord {
  return { entityType: 'favorite', entityId: id, payload: deleted ? null : payload, deleted, revision: ++head, schemaVersion: 1, updatedAt: new Date().toISOString(), updatedByDeviceId: enrollment.deviceId };
}
for (let index = 0; index < 1000; index++) {
  const targetId = `fixture-${index}`;
  records.push(record(`tool:${targetId}`, { id: `tool:${targetId}`, kind: 'tool', targetId, order: index }));
}
const api = {
  syncChanges: async (_token: string, cursor: number, limit: number, categories: readonly string[]) => {
    if (limit !== 16 || categories.join(',') !== 'favorites') throw new Error('Measurement crossed Android filtered/page contract.');
    pulls++;
    const remaining = records.filter(value => value.revision > cursor), changes = remaining.slice(0, limit), hasMore = remaining.length > limit;
    return { changes, cursor: hasMore ? changes.at(-1)!.revision : head, hasMore, headRevision: head, floor: 0, authorityEpoch: 1 };
  },
  syncPush: async (_token: string, ops: readonly SyncOp[]) => {
    pushes++;
    const results = ops.map(op => { const value = record(op.entityId, op.payload, op.opKind === 'delete'); records.push(value); return { opId: op.opId, status: 'applied' as const, revision: value.revision }; });
    return { results, headRevision: head };
  },
  syncReportState: async () => ({ headRevision: head, floor: 0, authorityEpoch: 1, retentionDays: 90 }),
};
const session = { getEnrollment: () => enrollment, refreshTrust: async () => undefined, clear: () => undefined,
  withToken: async <T>(work: (client: typeof api, token: string) => Promise<T>) => work(api, 'fixture-token') } as unknown as MobileDeviceSession;
const driver = new MobileSyncDriver({ store, session, contextId: context.id, id: () => `measurement-${++sequence}`, now: Date.now, onState: () => undefined });
try {
  const catchUpStart = performance.now();
  await driver.setForeground(true);
  while ((await store.context(context.id)).cursor < head) {
    if (driver.getState().phase === 'offline' || driver.getState().phase === 'error') throw new Error(driver.getState().detail);
    await driver.syncNow();
  }
  const catchUpMilliseconds = performance.now() - catchUpStart;
  const catchUpPages = pulls;
  await driver.setForeground(false);
  for (let index = 0; index < 100; index++) {
    const targetId = `offline-${index}`;
    await store.favoriteRepository(context.id).upsert({ id: `tool:${targetId}`, kind: 'tool', targetId, order: index });
  }
  const pendingBefore = (await store.pending(context.id)).length;
  const replayStart = performance.now();
  await driver.setForeground(true);
  while ((await store.pending(context.id)).length) await driver.syncNow();
  const replayMilliseconds = performance.now() - replayStart;
  await driver.stop();
  await sql.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const result = { recordedAt: new Date().toISOString(), measurement: 'Host Node SQLite + actual Android driver, contract-shaped in-memory Hub; no Android/network/authentication timing',
    catchUp: { records: 1000, milliseconds: catchUpMilliseconds, pullPages: catchUpPages }, replay: { pendingBefore, pendingAfter: (await store.pending(context.id)).length, milliseconds: replayMilliseconds, pushRequests: pushes, pullPages: pulls - catchUpPages },
    databaseBytes: statSync(file).size, thresholds: null };
  mkdirSync('dist/measurements', { recursive: true });
  writeFileSync('dist/measurements/mobile-sync.json', `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally { await driver.stop(); await sql.close(); }
