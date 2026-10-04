import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import {
  SYNC_CURSOR_EXPIRED, SYNC_WIRE_CATEGORY_IDS, SyncChangesResponse, SyncClearPreview, SyncClearRequest, SyncClearResponse, SyncOp, SyncOpResult,
  SyncPushRequest, SyncPushResponse, SyncRecord, SyncSnapshotResponse, SyncStateReport, SyncStateResponse, SyncSummary,
  SyncChangesQuery, SyncSnapshotQuery, SyncChangesQueryString, SyncSnapshotQueryString, parseSyncCategoriesQuery,
} from './sync.schema.js';
import { RealtimeServerMessage } from './realtime.schema.js';
import { HUB_PROTOCOL_VERSION, hubSupportsSync } from './protocol.js';
import { isHubAuditEvent } from './audit.js';

const record = { entityType: 'setting', entityId: 'core:theme', revision: 3, deleted: false, payload: { namespace: 'core', key: 'theme', value: 'dark' }, schemaVersion: 1, updatedAt: '2026-01-01T00:00:00.000Z', updatedByDeviceId: null };
const op = { opId: 'op-1', entityType: 'setting', entityId: 'core:theme', opKind: 'upsert', schemaVersion: 1, basedOnRevision: null, payload: { a: 1 } };
const flags = Object.fromEntries(SYNC_WIRE_CATEGORY_IDS.map((id) => [id, true]));
const counts = Object.fromEntries(SYNC_WIRE_CATEGORY_IDS.map((id) => [id, 2]));

describe('sync wire schemas', () => {
  it('accepts omitted filters and nonempty unique typed and comma-separated wire filters', () => {
    for (const categories of [undefined, ['favorites'], [...SYNC_WIRE_CATEGORY_IDS]]) {
      expect(Value.Check(SyncChangesQuery, { after: 0, ...(categories ? { categories } : {}) })).toBe(true);
      expect(Value.Check(SyncSnapshotQuery, categories ? { categories } : {})).toBe(true);
      const wire = categories?.join(',');
      expect(Value.Check(SyncChangesQueryString, { after: '0', ...(wire ? { categories: wire } : {}) })).toBe(true);
      expect(Value.Check(SyncSnapshotQueryString, wire ? { categories: wire } : {})).toBe(true);
      expect(parseSyncCategoriesQuery(wire)).toEqual(categories);
    }
  });

  it('rejects empty, repeated, unknown and malformed category filters', () => {
    for (const categories of [[], ['favorites', 'favorites'], ['unknown'], ['favorites', null]]) {
      expect(Value.Check(SyncChangesQuery, { after: 0, categories })).toBe(false);
      expect(Value.Check(SyncSnapshotQuery, { categories })).toBe(false);
    }
    for (const categories of ['', ',', 'favorites,', ',settings', 'favorites,,settings', 'favorites,favorites',
      'settings,favorites,settings', 'favorites,settings,favorites,usage', 'unknown', 'favorites,unknown', ' favorites']) {
      expect(Value.Check(SyncChangesQueryString, { after: '0', categories })).toBe(false);
      expect(Value.Check(SyncSnapshotQueryString, { categories })).toBe(false);
      expect(() => parseSyncCategoriesQuery(categories)).toThrow(TypeError);
    }
    expect(Value.Check(SyncSnapshotQueryString, { categories: ['favorites', 'settings'] })).toBe(false);
    expect(Value.Check(SyncChangesQueryString, { after: ['0', '1'] })).toBe(false);
  });

  it('accepts valid records and ops, rejects bad ones', () => {
    expect(Value.Check(SyncRecord, record)).toBe(true);
    expect(Value.Check(SyncRecord, { ...record, payload: null, deleted: true })).toBe(true);
    expect(Value.Check(SyncRecord, { ...record, revision: -1 })).toBe(false);
    expect(Value.Check(SyncOp, op)).toBe(true);
    expect(Value.Check(SyncOp, { ...op, opKind: 'patch' })).toBe(false);
    expect(Value.Check(SyncOp, { ...op, entityId: 'x'.repeat(201) })).toBe(false);
    expect(Value.Check(SyncOp, { ...op, entityType: 'x'.repeat(65) })).toBe(false);
    expect(Value.Check(SyncOp, { ...op, opId: 'x'.repeat(65) })).toBe(false);
  });

  it('limits push to 1..100 ops', () => {
    expect(Value.Check(SyncPushRequest, { ops: [op] })).toBe(true);
    expect(Value.Check(SyncPushRequest, { ops: Array.from({ length: 100 }, () => op) })).toBe(true);
    expect(Value.Check(SyncPushRequest, { ops: Array.from({ length: 101 }, () => op) })).toBe(false);
    expect(Value.Check(SyncPushRequest, { ops: [] })).toBe(false);
  });

  it('discriminates op results', () => {
    expect(Value.Check(SyncOpResult, { opId: 'a', status: 'applied', revision: 4 })).toBe(true);
    expect(Value.Check(SyncOpResult, { opId: 'a', status: 'duplicate', revision: 4 })).toBe(true);
    expect(Value.Check(SyncOpResult, { opId: 'a', status: 'conflict', current: record })).toBe(true);
    expect(Value.Check(SyncOpResult, { opId: 'a', status: 'rejected', reason: 'too-large' })).toBe(true);
    expect(Value.Check(SyncOpResult, { opId: 'a', status: 'rejected', reason: 'nope' })).toBe(false);
    expect(Value.Check(SyncOpResult, { opId: 'a', status: 'conflict' })).toBe(false);
    expect(Value.Check(SyncOpResult, { opId: 'a', status: 'applied' })).toBe(false);
    expect(Value.Check(SyncOpResult, { opId: 'a', status: 'merged', revision: 1 })).toBe(false);
    expect(Value.Check(SyncPushResponse, { results: [{ opId: 'a', status: 'applied', revision: 4 }], headRevision: 4 })).toBe(true);
  });

  it('validates read and state payloads', () => {
    expect(Value.Check(SyncChangesResponse, { changes: [record], cursor: 3, hasMore: false, floor: 0, headRevision: 3 })).toBe(true);
    expect(Value.Check(SyncChangesResponse, { changes: [record], cursor: 3, hasMore: false, floor: 0 })).toBe(false);
    expect(Value.Check(SyncSnapshotResponse, { records: [record], asOfRevision: 3, next: { afterType: 'setting', afterId: 'a' }, floor: 0 })).toBe(true);
    expect(Value.Check(SyncSnapshotResponse, { records: [], asOfRevision: 3, next: null, floor: 0 })).toBe(true);
    const report = { cursor: 3, pending: 0, quarantined: 0, conflicts: 0, stranded: 0, categories: flags, lastSyncAt: null };
    expect(Value.Check(SyncStateReport, report)).toBe(true);
    expect(Value.Check(SyncStateReport, { ...report, categories: { settings: true } })).toBe(false);
    expect(Value.Check(SyncStateResponse, { floor: 0, headRevision: 3, retentionDays: 90 })).toBe(true);
    expect(Value.Check(SyncSummary, { floor: 0, headRevision: 3, retentionDays: 90, counts, devices: [{ deviceId: 'd', cursor: 1, lag: 2, lastPushAt: null, lastPullAt: null, quarantined: 0, conflicts: 0, pending: 0, kind: 'desktop', paused: false }] })).toBe(true);
  });

  it('validates the clear two-step', () => {
    expect(Value.Check(SyncClearPreview, { confirmationId: 'c', recordCount: 5, deviceCount: 2, expiresAt: '2026-01-01T00:00:00.000Z' })).toBe(true);
    expect(Value.Check(SyncClearRequest, { confirmationId: 'c' })).toBe(true);
    expect(Value.Check(SyncClearRequest, {})).toBe(false);
    expect(Value.Check(SyncClearResponse, { deleted: 5, headRevision: 9 })).toBe(true);
  });

  it('exposes protocol 2, the cursor-expired code, audit events and the realtime event', () => {
    expect(SYNC_CURSOR_EXPIRED).toBe('cursor-expired');
    expect(HUB_PROTOCOL_VERSION).toBe(2);
    expect(hubSupportsSync(1)).toBe(false);
    expect(hubSupportsSync(2)).toBe(true);
    for (const e of ['sync.pushed', 'sync.snapshot', 'sync.state-reported', 'sync.compacted', 'sync.environment-clear-previewed', 'sync.environment-cleared']) expect(isHubAuditEvent(e)).toBe(true);
    expect(Value.Check(RealtimeServerMessage, { type: 'event', event: 'changes-available', data: { revision: 7 } })).toBe(true);
  });
});
