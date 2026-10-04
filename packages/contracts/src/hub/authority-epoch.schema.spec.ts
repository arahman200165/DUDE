import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { DeviceTokenResponse } from './devices.schema.js';
import { HelloResponse } from './hello.schema.js';
import { RealtimeServerMessage } from './realtime.schema.js';
import { SyncChangesResponse, SyncSnapshotResponse, SyncStateResponse } from './sync.schema.js';

const spki = 'A'.repeat(43);
const hello = {
  service: 'dude-hub', protocolVersion: 1, minClientProtocol: 1, hubVersion: '0.1.0',
  hubInstanceId: '123e4567-e89b-42d3-a456-426614174000', environmentId: null, bootstrapped: false,
  tls: { spkiSha256: spki, nextSpkiSha256: null },
};
const token = { accessToken: `ddt_${'a'.repeat(43)}`, expiresAt: '2026-01-01T00:00:00.000Z' };
const welcome = {
  type: 'welcome', protocolVersion: 1, sessionKind: 'device', deviceId: 'd', heartbeatIntervalMs: 25_000,
  tls: { spkiSha256: spki, nextSpkiSha256: null },
};
const changes = { changes: [], cursor: 3, hasMore: false, floor: 0, headRevision: 3 };
const snapshot = { records: [], asOfRevision: 3, next: null, floor: 0 };
const state = { floor: 0, headRevision: 3, retentionDays: 90 };

const BAD_EPOCHS = [0, -1, 1.5, 'x', '1', null];

describe('authority epoch fields', () => {
  it('advertises category filtering as an optional true literal for legacy compatibility', () => {
    expect(Value.Check(HelloResponse, hello)).toBe(true);
    expect(Value.Check(HelloResponse, { ...hello, syncCategoryFiltering: true })).toBe(true);
    for (const syncCategoryFiltering of [false, 'true', 1, null]) {
      expect(Value.Check(HelloResponse, { ...hello, syncCategoryFiltering })).toBe(false);
    }
  });
  it('are optional on every response that carries them', () => {
    expect(Value.Check(HelloResponse, hello)).toBe(true);
    expect(Value.Check(DeviceTokenResponse, token)).toBe(true);
    expect(Value.Check(RealtimeServerMessage, welcome)).toBe(true);
    expect(Value.Check(SyncChangesResponse, changes)).toBe(true);
    expect(Value.Check(SyncSnapshotResponse, snapshot)).toBe(true);
    expect(Value.Check(SyncStateResponse, state)).toBe(true);
  });

  it('accept a positive integer epoch', () => {
    for (const authorityEpoch of [1, 2, 41]) {
      expect(Value.Check(HelloResponse, { ...hello, authorityEpoch, authorityState: 'active' })).toBe(true);
      expect(Value.Check(DeviceTokenResponse, { ...token, authorityEpoch })).toBe(true);
      expect(Value.Check(RealtimeServerMessage, { ...welcome, authorityEpoch })).toBe(true);
      expect(Value.Check(SyncChangesResponse, { ...changes, authorityEpoch })).toBe(true);
      expect(Value.Check(SyncSnapshotResponse, { ...snapshot, authorityEpoch })).toBe(true);
      expect(Value.Check(SyncStateResponse, { ...state, authorityEpoch })).toBe(true);
    }
  });

  it.each(BAD_EPOCHS)('reject epoch %j everywhere', (authorityEpoch) => {
    expect(Value.Check(HelloResponse, { ...hello, authorityEpoch })).toBe(false);
    expect(Value.Check(DeviceTokenResponse, { ...token, authorityEpoch })).toBe(false);
    expect(Value.Check(RealtimeServerMessage, { ...welcome, authorityEpoch })).toBe(false);
    expect(Value.Check(SyncChangesResponse, { ...changes, authorityEpoch })).toBe(false);
    expect(Value.Check(SyncSnapshotResponse, { ...snapshot, authorityEpoch })).toBe(false);
    expect(Value.Check(SyncStateResponse, { ...state, authorityEpoch })).toBe(false);
  });

  it('accept only the closed authority states on hello', () => {
    expect(Value.Check(HelloResponse, { ...hello, authorityState: 'active' })).toBe(true);
    expect(Value.Check(HelloResponse, { ...hello, authorityState: 'transferred' })).toBe(true);
    expect(Value.Check(HelloResponse, { ...hello, authorityState: 'weird' })).toBe(false);
    expect(Value.Check(HelloResponse, { ...hello, authorityState: 1 })).toBe(false);
  });
});
