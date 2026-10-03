import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SYNC_LIMITS } from '@dude/sync';
import type { Db } from '@dude/sqlite-store';
import { openHubDb } from './open-hub-db.js';
import { commitCanonical, currentRevision, getCanonicalRecord } from './canonical-repository.js';
import type { CanonicalCommit, SyncCommitResult } from './canonical-repository.js';
import {
  changesAfter, compactBefore, countLiveRecordsByCategory, countLiveRecordsByType, getSyncFloor, listDeviceSyncState, recordDeviceSyncState,
  snapshotPage,
} from './sync-repository.js';

const ENV = 'env-1';
const NOW = '2026-01-01T00:00:00.000Z';
const open: Array<() => void> = [];
afterEach(() => { while (open.length) open.pop()!(); });

function freshDb(): Db {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hub-sync-'));
  const result = openHubDb({ dbFile: path.join(dir, 'dude.db'), preMigrationDir: path.join(dir, 'pre') });
  if (result.status !== 'ready') throw new Error('not ready');
  open.push(result.hub.close);
  result.hub.db.prepare('INSERT INTO environment(environment_id, display_name, created_at) VALUES(?, ?, ?)').run(ENV, 'Env', NOW);
  return result.hub.db;
}

const TOOLS = [{ id: 'base64', persistence: { preferences: 'local' as const } }, { id: 'sec', persistence: { preferences: 'secure-local' as const } }];
const pipe = (id: string, name = 'P') => ({ id, name, steps: [], createdAt: NOW, updatedAt: NOW });
const push = (db: Db, c: Partial<CanonicalCommit> & Pick<CanonicalCommit, 'entityType' | 'entityId' | 'op'>): SyncCommitResult =>
  commitCanonical(db, { environmentId: ENV, now: NOW, tools: TOOLS, ...c, enforcePolicy: true });
const upPipe = (db: Db, id: string, based: number | null, name = 'P', extra: Partial<CanonicalCommit> = {}) =>
  push(db, { entityType: 'pipeline', entityId: id, op: 'upsert', payload: pipe(id, name), basedOnRevision: based, ...extra });
const setting = (ns: string, key: string, value: unknown = 1) => ({ namespace: ns, key, value });

describe('sync policy enforcement', () => {
  it('applies merge3 creates, rejects stale bases and create-over-live', () => {
    const db = freshDb();
    expect(upPipe(db, 'p1', null)).toEqual({ status: 'applied', revision: 1 });
    expect(upPipe(db, 'p1', 1, 'B')).toEqual({ status: 'applied', revision: 2 });
    const stale = upPipe(db, 'p1', 1, 'C');
    expect(stale).toMatchObject({ status: 'conflict', current: { revision: 2, deleted: false, entityId: 'p1', payload: { name: 'B' } } });
    expect(upPipe(db, 'p1', null, 'D')).toMatchObject({ status: 'conflict' });
    expect(getCanonicalRecord(db, ENV, 'pipeline', 'p1')?.revision).toBe(2);
  });

  it('conflicts when editing a tombstone from an older base, applies from the tombstone revision', () => {
    const db = freshDb();
    upPipe(db, 'p1', null);
    expect(push(db, { entityType: 'pipeline', entityId: 'p1', op: 'delete', basedOnRevision: 1 })).toEqual({ status: 'applied', revision: 2 });
    const edit = upPipe(db, 'p1', 1, 'E');
    expect(edit).toMatchObject({ status: 'conflict', current: { deleted: true, payload: null, revision: 2 } });
    expect(upPipe(db, 'p1', 2, 'E')).toEqual({ status: 'applied', revision: 3 });
  });

  it('applies lww over a stale base', () => {
    const db = freshDb();
    const fav = (o: number) => ({ id: 'tool:a', kind: 'tool', targetId: 'a', order: o });
    push(db, { entityType: 'favorite', entityId: 'tool:a', op: 'upsert', payload: fav(1), basedOnRevision: null });
    expect(push(db, { entityType: 'favorite', entityId: 'tool:a', op: 'upsert', payload: fav(2), basedOnRevision: 0 })).toEqual({ status: 'applied', revision: 2 });
  });

  it('enforces per-device ownership without the codec id check', () => {
    const db = freshDb();
    const usage = { schemaVersion: 2, tools: {} };
    expect(push(db, { entityType: 'usage', entityId: 'dev-1', op: 'upsert', payload: usage, actingDeviceId: 'dev-2' }))
      .toEqual({ status: 'rejected', reason: 'not-owner-device' });
    const ok = push(db, { entityType: 'usage', entityId: 'dev-1', op: 'upsert', payload: usage, actingDeviceId: 'dev-1', deviceId: 'dev-1' });
    // the owner passes the ownership rule; whether the payload decodes is the usage codec's concern
    expect(ok.status === 'applied' || (ok.status === 'rejected' && ok.reason === 'invalid-payload')).toBe(true);
  });

  it('rejects unknown, non-syncing and invalid input as reasons', () => {
    const db = freshDb();
    expect(push(db, { entityType: 'nope', entityId: 'x', op: 'upsert', payload: {} })).toEqual({ status: 'rejected', reason: 'unknown-entity' });
    expect(push(db, { entityType: 'history-entry', entityId: 'x', op: 'upsert', payload: {} })).toEqual({ status: 'rejected', reason: 'non-syncable-scope' });
    expect(push(db, { entityType: 'appearance', entityId: 'default', op: 'upsert', payload: {} })).toEqual({ status: 'rejected', reason: 'unknown-entity' });
    expect(push(db, { entityType: 'pipeline', entityId: 'p', op: 'upsert', payload: { junk: true } })).toEqual({ status: 'rejected', reason: 'invalid-payload' });
    expect(push(db, { entityType: 'pipeline', entityId: 'other', op: 'upsert', payload: pipe('p') })).toEqual({ status: 'rejected', reason: 'invalid-payload' });
  });

  it('rejects oversized records and newer schemas', () => {
    const db = freshDb();
    const big = pipe('p1', 'x'.repeat(SYNC_LIMITS.maxRecordBytes));
    expect(push(db, { entityType: 'pipeline', entityId: 'p1', op: 'upsert', payload: big })).toEqual({ status: 'rejected', reason: 'too-large' });
    expect(upPipe(db, 'p1', null, 'P', { schemaVersion: 999 })).toEqual({ status: 'rejected', reason: 'schema-too-new' });
    expect(upPipe(db, 'p1', null, 'P', { schemaVersion: 1 }).status).toBe('applied');
  });

  it('validates setting keys against the shared predicate', () => {
    const db = freshDb();
    const up = (ns: string, key: string) => push(db, { entityType: 'setting', entityId: `${ns}:${key}`, op: 'upsert', payload: setting(ns, key) });
    expect(up('settings.ai', 'baseUrl')).toEqual({ status: 'rejected', reason: 'unknown-setting' });
    expect(up('sec', 'k')).toEqual({ status: 'rejected', reason: 'unknown-setting' });
    expect(up('mystery', 'k')).toEqual({ status: 'rejected', reason: 'unknown-setting' });
    expect(up('base64', 'wrap')).toEqual({ status: 'applied', revision: 1 });
    expect(up('settings', 'appearance').status).toBe('applied');
    expect(push(db, { entityType: 'setting', entityId: 'sec:k', op: 'delete' })).toEqual({ status: 'rejected', reason: 'unknown-setting' });
    expect(push(db, { entityType: 'setting', entityId: 'base64:wrap', op: 'delete' }).status).toBe('applied');
  });

  it('returns duplicate for a known opId even when policy would now reject', () => {
    const db = freshDb();
    expect(upPipe(db, 'p1', null, 'P', { opId: 'op-1' })).toEqual({ status: 'applied', revision: 1 });
    expect(upPipe(db, 'p1', null, 'P', { opId: 'op-1', schemaVersion: 999 })).toEqual({ status: 'duplicate', revision: 1 });
  });

  it('leaves legacy (non-enforcing) commits unchanged', () => {
    const db = freshDb();
    expect(commitCanonical(db, { environmentId: ENV, entityType: 'pipeline', entityId: 'p1', op: 'upsert', payload: pipe('p1'), now: NOW }).revision).toBe(1);
    expect(commitCanonical(db, { environmentId: ENV, entityType: 'pipeline', entityId: 'p1', op: 'upsert', payload: pipe('p1'), now: NOW }).revision).toBe(2);
  });
});

describe('changesAfter / snapshotPage / compaction', () => {
  function seed(db: Db): void {
    upPipe(db, 'p1', null); // 1
    upPipe(db, 'p2', null); // 2
    upPipe(db, 'p1', 1, 'B'); // 3
    push(db, { entityType: 'pipeline', entityId: 'p2', op: 'delete', basedOnRevision: 2 }); // 4
    upPipe(db, 'p3', null); // 5
  }

  it('dedups to the latest revision, orders by revision, includes tombstones and pages', () => {
    const db = freshDb();
    seed(db);
    const all = changesAfter(db, ENV, 0, 10);
    expect(all.changes.map((c) => [c.entityId, c.revision, c.deleted])).toEqual([['p1', 3, false], ['p2', 4, true], ['p3', 5, false]]);
    expect(all.changes[1]!.payload).toBeNull();
    expect(all.hasMore).toBe(false);
    const page = changesAfter(db, ENV, 0, 2);
    expect(page.changes.map((c) => c.revision)).toEqual([3, 4]);
    expect(page.hasMore).toBe(true);
    expect(changesAfter(db, ENV, 4, 10).changes.map((c) => c.entityId)).toEqual(['p3']);
  });

  it('pages live records by (type, id)', () => {
    const db = freshDb();
    seed(db);
    push(db, { entityType: 'favorite', entityId: 'tool:a', op: 'upsert', payload: { id: 'tool:a', kind: 'tool', targetId: 'a', order: 0 } });
    const first = snapshotPage(db, ENV, undefined, undefined, 2);
    expect(first.records.map((r) => `${r.entityType}/${r.entityId}`)).toEqual(['favorite/tool:a', 'pipeline/p1']);
    expect(first.next).toEqual({ afterType: 'pipeline', afterId: 'p1' });
    const second = snapshotPage(db, ENV, first.next!.afterType, first.next!.afterId, 2);
    expect(second.records.map((r) => r.entityId)).toEqual(['p3']);
    expect(second.next).toBeNull();
    expect(countLiveRecordsByType(db, ENV)).toEqual({ favorite: 1, pipeline: 2 });
    expect(countLiveRecordsByCategory(db, ENV)).toMatchObject({ favorites: 1, pipelines: 2, settings: 0 });
  });

  it('compaction drops tombstones and history, keeps live records, and raises the floor monotonically', () => {
    const db = freshDb();
    seed(db);
    expect(getSyncFloor(db)).toBe(0);
    const r = compactBefore(db, 4, '2026-06-01T00:00:00.000Z');
    expect(r).toMatchObject({ tombstones: 1, floor: 4 });
    expect(getCanonicalRecord(db, ENV, 'pipeline', 'p2')).toBeUndefined();
    expect(getCanonicalRecord(db, ENV, 'pipeline', 'p1')?.revision).toBe(3);
    expect((db.prepare('SELECT COUNT(*) AS n FROM change_feed').get() as { n: number }).n).toBe(1);
    expect(compactBefore(db, 2, NOW).floor).toBe(4);
    expect(getSyncFloor(db)).toBe(4);
  });

  it('answers a stale edit of a compacted tombstone with a deletion conflict instead of resurrecting it', () => {
    const db = freshDb();
    seed(db);
    compactBefore(db, 5, NOW);
    const result = push(db, { entityType: 'pipeline', entityId: 'p2', op: 'upsert', basedOnRevision: 2, payload: { schemaVersion: 1, id: 'p2', name: 'stale', steps: [], createdAt: NOW, updatedAt: NOW } });
    expect(result).toMatchObject({ status: 'conflict', current: { deleted: true, payload: null, revision: 5 } });
    expect(getCanonicalRecord(db, ENV, 'pipeline', 'p2')).toBeUndefined();
  });

  it('never restarts revisions after compaction empties the change feed', () => {
    const db = freshDb();
    seed(db);
    compactBefore(db, 5, NOW);
    expect((db.prepare('SELECT COUNT(*) AS n FROM change_feed').get() as { n: number }).n).toBe(0);
    expect(currentRevision(db)).toBe(5);
    expect(upPipe(db, 'p4', null)).toBeDefined();
    expect(currentRevision(db)).toBe(6);
  });
});

describe('device sync state', () => {
  it('upserts reports and lists them', () => {
    const db = freshDb();
    db.prepare(`INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
      VALUES('d1', ?, 'D', 'windows', '1', '{}', 1, 2, ?)`).run(ENV, NOW);
    recordDeviceSyncState(db, 'd1', { cursor: 5, pending: 2, quarantined: 0, conflicts: 1, stranded: 0, categories: { settings: true }, lastSyncAt: NOW }, NOW);
    recordDeviceSyncState(db, 'd1', null, '2026-01-02T00:00:00.000Z', { push: true });
    expect(listDeviceSyncState(db)).toEqual([{
      deviceId: 'd1', cursor: 5, reported: { pending: 2, quarantined: 0, conflicts: 1, stranded: 0, categories: { settings: true }, lastSyncAt: NOW },
      lastPushAt: '2026-01-02T00:00:00.000Z', lastPullAt: null, updatedAt: '2026-01-02T00:00:00.000Z',
    }]);
  });
});
