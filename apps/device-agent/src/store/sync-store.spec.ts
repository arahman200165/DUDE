import { afterEach, describe, expect, it } from 'vitest';
import { defaultCategoryMap } from '@dude/sync';
import { cleanupTemp, commitContext, openReady, tempDir } from '../testing/test-utils.js';
import { commitEntity } from './entity-commit.js';
import { commitKvBatch, applyRemoteKv, applyRemoteKvDelete } from './repos/kv.repo.js';
import { getKvSync } from './repos/kv-sync.repo.js';
import { saveEnrollment, markRevoked } from './repos/hub-enrollment.repo.js';
import {
  deleteIfUnchanged, listOutbox, listQuarantined, listSendable, markAttempt, markQuarantined, opStatusAtWrite, outboxCountsByStatus, setStatusAll,
} from './repos/outbox.repo.js';
import { applyRemoteDelete, applyRemoteRecord, listRecords, setHubState } from './repos/records.repo.js';
import { getSyncState, mergeCategories, updateSyncState } from './repos/sync-state.repo.js';
import { countConflicts, deleteConflict, getConflict, insertConflict, listConflicts } from './repos/sync-conflicts.repo.js';
import { MIGRATIONS } from './migrations/index.js';

afterEach(cleanupTemp);

const T0 = new Date('2026-02-01T00:00:00.000Z');
const ENROLL = {
  hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: 'https://hub.lan:8443', protocolVersion: 2, spkiActive: 'spki-a', certActivePem: 'PEM-A',
  keyId: 'key-1', publicKey: new Uint8Array([1]), wrappedPrivateKey: new Uint8Array([2]), enrolledAt: T0.toISOString(),
};
const fav = (id: string, order = 0) => ({ entityType: 'favorite', entityId: `tool:${id}`, op: 'upsert' as const, payload: { id: `tool:${id}`, kind: 'tool', targetId: id, order } });
const usage = (deviceId?: string) => ({
  schemaVersion: 2, counts: { base64: { count: 2, lastUsedAt: '2026-01-01T00:00:00.000Z' } }, recentLog: [], dailyBuckets: [], trackingStartedOn: null,
  ...(deviceId ? { deviceId } : {}),
});

describe('migration 0003', () => {
  it('upgrades a 0002 store keeping outbox rows and re-ids the default usage record to the device id', () => {
    const dir = tempDir();
    const old = openReady(dir, { migrations: MIGRATIONS.slice(0, 2) });
    const deviceId = old.device.deviceId;
    const row = (type: string, id: string, payload: unknown) => {
      const json = JSON.stringify(payload);
      old.db.prepare("INSERT INTO records(entity_type, entity_id, environment_id, scope, schema_version, local_revision, payload_json, created_at, updated_at) VALUES(?, ?, 'env-1', 'environment', 1, 1, ?, 't', 't')").run(type, id, json);
      old.db.prepare("INSERT INTO outbox(op_id, entity_type, entity_id, environment_id, device_id, op_kind, schema_version, local_revision, payload_json, status, created_at, updated_at) VALUES(?, ?, ?, 'env-1', ?, 'upsert', 1, 1, ?, 'unsent-standalone', 't', 't')").run(`op-${id}`, type, id, deviceId, json);
    };
    row('favorite', 'tool:a', fav('a').payload);
    row('usage', 'default', usage());
    expect(listOutbox(old.db, 10)).toHaveLength(2);
    old.close();

    const store = openReady(dir);
    const ops = listOutbox(store.db, 10);
    expect(ops.map((o) => `${o.entityType}:${o.entityId}`).sort()).toEqual(['favorite:tool:a', `usage:${deviceId}`]);
    expect(ops.find((o) => o.entityType === 'usage')?.payload).toMatchObject({ deviceId });
    expect(ops.every((o) => o.status === 'unsent-standalone')).toBe(true);
    expect(listRecords(store.db, 'usage').map((r) => r.entityId)).toEqual([deviceId]);
    expect(listRecords(store.db, 'usage')[0].payload).toMatchObject({ deviceId });
    expect(store.db.prepare('SELECT attempts, reason FROM outbox LIMIT 1').get()).toEqual({ attempts: 0, reason: null });
    expect(getSyncState(store.db)).toMatchObject({ cursor: 0, floor: 0, paused: false, firstSyncState: 'pending', lastError: null, categories: defaultCategoryMap() });
    expect(store.health().minReaderVersion).toBe(1);
  });
});

describe('op status at write time', () => {
  it('follows the enrollment: unsent-standalone, pending, stranded', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    commitEntity(store.db, ctx, fav('a'));
    expect(listOutbox(store.db, 10)[0].status).toBe('unsent-standalone');
    saveEnrollment(store.db, ENROLL, T0);
    expect(opStatusAtWrite(store.db)).toBe('pending');
    commitEntity(store.db, ctx, fav('b'));
    expect(listOutbox(store.db, 10).find((o) => o.entityId === 'tool:b')?.status).toBe('pending');
    markRevoked(store.db, T0);
    commitEntity(store.db, ctx, fav('c'));
    expect(listOutbox(store.db, 10).find((o) => o.entityId === 'tool:c')?.status).toBe('stranded');
  });

  it('a clone rewrites the device id of unsent-standalone and pending ops', () => {
    const dir = tempDir();
    const a = openReady(dir, { machineGuid: 'guid-A' });
    saveEnrollment(a.db, ENROLL, T0);
    commitEntity(a.db, commitContext(a), fav('a'));
    const oldId = a.device.deviceId;
    a.close();
    const b = openReady(dir, { machineGuid: 'guid-B' });
    expect(b.device.deviceId).not.toBe(oldId);
    const op = listOutbox(b.db, 10)[0];
    expect(op.deviceId).toBe(b.device.deviceId);
    expect(op.status).toBe('unsent-standalone');
  });
});

describe('kv journaling', () => {
  it('journals environment tool prefs as setting ops and skips device/local-only keys and non-tool namespaces', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    commitKvBatch(store.db, [
      { namespace: 'base64', key: 'wrap', value: true, policy: 'local' },
      { namespace: 'scoped', key: 'env', value: 1, policy: 'local', scope: 'environment' },
      { namespace: 'scoped', key: 'dev', value: 2, policy: 'local', scope: 'device' },
      { namespace: 'scoped', key: 'sess', value: 5, policy: 'session' },
      { namespace: '__internal__', key: 'x', value: 3, policy: 'local' },
      { namespace: 'settings.ai', key: 'baseUrl', value: 'u', policy: 'local' },
    ], undefined, undefined, ctx);
    const ops = listOutbox(store.db, 10);
    expect(ops.map((o) => o.entityId).sort()).toEqual(['base64:wrap', 'scoped:env']);
    expect(ops.find((o) => o.entityId === 'base64:wrap')?.payload).toEqual({ namespace: 'base64', key: 'wrap', value: true });
    expect(ops[0].entityType).toBe('setting');
  });

  it('journals the workspace layout and scratchpad kv keys as entity ops with the value as payload', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    const layout = { schemaVersion: 1, openTabs: ['base64'], panelTree: null, focusedNodeId: null };
    commitKvBatch(store.db, [
      { namespace: '__workspace__', key: 'layout', value: layout, policy: 'local' },
      { namespace: '__workspace__', key: 'scratchpad', value: { schemaVersion: 1, snippets: [], drawerExpanded: false }, policy: 'local' },
    ], undefined, undefined, ctx);
    const ops = listOutbox(store.db, 10);
    expect(ops.map((o) => `${o.entityType}:${o.entityId}`).sort()).toEqual(['scratchpad:default', 'workspace-layout:default']);
    expect(ops.find((o) => o.entityType === 'workspace-layout')?.payload).toEqual(layout);
  });

  it('takes basedOnRevision from kv_sync for kv keys and from records.hub_revision for records', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    applyRemoteKv(store.db, 'base64', 'wrap', false, 7, { namespace: 'base64', key: 'wrap', value: false }, T0);
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM outbox').get()).toEqual({ n: 0 });
    commitKvBatch(store.db, [{ namespace: 'base64', key: 'wrap', value: true, policy: 'local' }], undefined, undefined, ctx);
    expect(listOutbox(store.db, 10)[0].basedOnRevision).toBe(7);

    commitEntity(store.db, ctx, fav('a'));
    expect(setHubState(store.db, 'favorite', 'tool:a', 11, { id: 'tool:a' })).toBe(true);
    store.db.exec("DELETE FROM outbox WHERE entity_type = 'favorite'");
    commitEntity(store.db, ctx, fav('a', 5));
    expect(listOutbox(store.db, 10).find((o) => o.entityType === 'favorite')?.basedOnRevision).toBe(11);
  });
});

describe('outbox repo', () => {
  it('coalescing onto a quarantined op resets it to pending and clears the reason', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    saveEnrollment(store.db, ENROLL, T0);
    commitEntity(store.db, ctx, fav('a'));
    const first = listOutbox(store.db, 1)[0];
    markAttempt(store.db, first.opId, T0.toISOString());
    expect(markQuarantined(store.db, first.opId, 'invalid-payload')).toBe(true);
    expect(listQuarantined(store.db)[0]).toMatchObject({ reason: 'invalid-payload', attempts: 1 });
    commitEntity(store.db, ctx, fav('a', 2));
    expect(listOutbox(store.db, 1)[0].status).toBe('pending');
    expect(store.db.prepare('SELECT reason, attempts FROM outbox').get()).toEqual({ reason: null, attempts: 0 });
  });

  it('listSendable returns only pending ops of enabled categories; counts derive held', () => {
    const store = openReady(tempDir());
    const ctx = commitContext(store);
    saveEnrollment(store.db, ENROLL, T0);
    commitEntity(store.db, ctx, fav('a'));
    commitEntity(store.db, ctx, { entityType: 'usage', entityId: store.device.deviceId, op: 'upsert', payload: usage(store.device.deviceId) });
    const cats = defaultCategoryMap();
    expect(listSendable(store.db, cats, 10).map((o) => o.entityType)).toEqual(['favorite']);
    expect(listSendable(store.db, { ...cats, usage: true }, 10)).toHaveLength(2);
    expect(listSendable(store.db, { ...cats, usage: true }, 1)).toHaveLength(1);
    expect(listSendable(store.db, { ...cats, favorites: false }, 10)).toEqual([]);
    expect(outboxCountsByStatus(store.db, cats, true)).toMatchObject({ pending: 1, held: 1 });
    expect(outboxCountsByStatus(store.db, cats, false)).toMatchObject({ pending: 0, held: 2 });
  });

  it('deleteIfUnchanged keeps an op edited since it was sent; setStatusAll moves statuses', () => {
    const store = openReady(tempDir());
    commitEntity(store.db, commitContext(store, { now: () => new Date('2026-03-01T00:00:00.000Z') }), fav('a'));
    const sent = listOutbox(store.db, 1)[0];
    expect(setStatusAll(store.db, ['unsent-standalone'], 'pending')).toBe(1);
    commitEntity(store.db, commitContext(store, { now: () => new Date('2026-03-02T00:00:00.000Z') }), fav('a', 3));
    expect(deleteIfUnchanged(store.db, sent.opId, sent.updatedAt)).toBe(false);
    const current = listOutbox(store.db, 1)[0];
    expect(deleteIfUnchanged(store.db, current.opId, current.updatedAt)).toBe(true);
    expect(listOutbox(store.db, 1)).toEqual([]);
  });
});

describe('apply remote writes', () => {
  it('writes records and kv without journaling and records the Hub state', () => {
    const store = openReady(tempDir());
    const payload = { id: 'tool:a', kind: 'tool', targetId: 'a', order: 4 };
    applyRemoteRecord(store.db, { entityType: 'favorite', entityId: 'tool:a', payload, hubRevision: 5, environmentId: 'env-hub', now: T0 });
    expect(listRecords(store.db, 'favorite')[0]).toMatchObject({ entityId: 'tool:a', hubRevision: 5, payload });
    expect(store.db.prepare('SELECT hub_payload_json FROM records').get()).toEqual({ hub_payload_json: JSON.stringify(payload) });
    applyRemoteKv(store.db, 'base64', 'wrap', true, 6, { namespace: 'base64', key: 'wrap', value: true }, T0);
    expect(getKvSync(store.db, 'base64', 'wrap')?.hubRevision).toBe(6);
    expect(store.db.prepare('SELECT value_json FROM kv WHERE namespace = ?').get('base64')).toEqual({ value_json: 'true' });
    applyRemoteKvDelete(store.db, 'base64', 'wrap', 9);
    expect(getKvSync(store.db, 'base64', 'wrap')).toEqual({ hubRevision: 9, base: null });
    expect(applyRemoteDelete(store.db, 'favorite', 'tool:a')).toBe(true);
    expect(listOutbox(store.db, 10)).toEqual([]);
  });
});

describe('sync state and conflicts', () => {
  it('merges categories with defaults and ignores unknown keys', () => {
    expect(mergeCategories({ usage: true, nope: true, settings: 'x' })).toEqual({ ...defaultCategoryMap(), usage: true });
    const store = openReady(tempDir());
    const next = updateSyncState(store.db, { cursor: 12, categories: { scratchpad: true }, paused: true });
    expect(next).toMatchObject({ cursor: 12, paused: true });
    expect(getSyncState(store.db).categories.scratchpad).toBe(true);
    expect(getSyncState(store.db).categories.favorites).toBe(true);
  });

  it('inserts, lists, gets, counts and deletes conflicts', () => {
    const store = openReady(tempDir());
    const id = insertConflict(store.db, {
      entityType: 'pipeline', entityId: 'p1', kind: 'edit-edit', localPayload: { a: 1 }, localDeleted: false, basePayload: null,
      remotePayload: { a: 2 }, remoteDeleted: false, remoteRevision: 4, fields: ['a'], detectedAt: T0.toISOString(),
    });
    expect(countConflicts(store.db)).toBe(1);
    expect(getConflict(store.db, id)).toMatchObject({ kind: 'edit-edit', localPayload: { a: 1 }, remotePayload: { a: 2 }, fields: ['a'] });
    expect(listConflicts(store.db)).toHaveLength(1);
    expect(deleteConflict(store.db, id)).toBe(true);
    expect(countConflicts(store.db)).toBe(0);
  });
});
