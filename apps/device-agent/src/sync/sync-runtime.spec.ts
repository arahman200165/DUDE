import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubApiError } from '@dude/api-client';
import type { AgentHubStatus } from '@dude/contracts';
import type { SyncOpResult, SyncRecord, SyncSnapshotResponse } from '@dude/contracts/hub';
import { cleanupTemp, commitContext, openReady, tempDir } from '../testing/test-utils.js';
import { commitEntity } from '../store/entity-commit.js';
import { saveEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { listOutbox } from '../store/repos/outbox.repo.js';
import { listRecords } from '../store/repos/records.repo.js';
import { getSyncState } from '../store/repos/sync-state.repo.js';
import { HubManagerError } from '../hub/errors.js';
import type { SyncManagerPort } from './sync-runtime.js';
import { createSyncRuntime } from './sync-runtime.js';
import type { SyncRuntime } from './sync-runtime.js';

afterEach(() => { for (const r of runtimes.splice(0)) r.stop(); cleanupTemp(); });
const runtimes: SyncRuntime[] = [];

const T0 = new Date('2026-02-01T00:00:00.000Z');
const ENROLL = {
  hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: 'https://hub.lan:8443', protocolVersion: 2, spkiActive: 'spki-a', certActivePem: 'PEM-A',
  keyId: 'key-1', publicKey: new Uint8Array([1]), wrappedPrivateKey: new Uint8Array([2]), enrolledAt: T0.toISOString(),
};

const rec = (entityType: string, entityId: string, revision: number, payload: unknown | null): SyncRecord => ({
  entityType, entityId, revision, deleted: payload === null, payload, schemaVersion: 1, updatedAt: '2026-02-01T00:00:00.000Z', updatedByDeviceId: 'other',
});
const fav = (id: string, order = 0) => ({ id: `tool:${id}`, kind: 'tool', targetId: id, order });
const pipe = (id: string) => ({ schemaVersion: 1, id, name: 'P', description: 'd', steps: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
const changes = (records: SyncRecord[], cursor: number, over: Record<string, unknown> = {}) => ({ changes: records, cursor, hasMore: false, floor: 0, headRevision: cursor, ...over });

async function waitFor<T>(what: string, fn: () => T | undefined | false, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function setup(options: { protocol?: number; hubState?: AgentHubStatus['state']; firstSync?: boolean } = {}) {
  const store = openReady(tempDir());
  saveEnrollment(store.db, ENROLL, T0);
  const commit = commitContext(store);
  let hub: AgentHubStatus = {
    state: options.hubState ?? 'online', lastError: null, lastContactAt: null, ownerSignedIn: false, hubVersion: '1', recoveryTrusted: null,
    enrollment: {
      state: 'enrolled', hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: 'https://hub.lan:8443', protocolVersion: 2, spkiActive: 'spki-a',
      spkiNext: null, enrolledAt: T0.toISOString(), lastContactAt: null, revokedAt: null,
    },
  };
  let protocol = options.protocol ?? 2;
  const hubListeners = new Set<(s: AgentHubStatus) => void>();
  const nudges = new Set<(rev: number) => void>();
  const api = {
    syncPush: vi.fn(async (_t: string, ops: readonly { opId: string }[]): Promise<{ results: SyncOpResult[]; headRevision: number }> => ({ results: ops.map((o, i) => ({ opId: o.opId, status: 'applied' as const, revision: i + 1 })), headRevision: 9 })),
    syncChanges: vi.fn(async (_t: string, _after: number, _limit?: number): Promise<ReturnType<typeof changes>> => changes([], 0)),
    syncSnapshot: vi.fn(async (_t: string, _page?: unknown): Promise<SyncSnapshotResponse> => ({ records: [], asOfRevision: 0, next: null, floor: 0 })),
    syncReportState: vi.fn(async (_t: string, _r: unknown) => ({ floor: 0, headRevision: 9, retentionDays: 90 })),
  };
  const manager: SyncManagerPort = {
    status: () => hub,
    onChange: (l) => { hubListeners.add(l); return () => { hubListeners.delete(l); }; },
    hubProtocol: () => protocol,
    onChangesAvailable: (l) => { nudges.add(l); return () => { nudges.delete(l); }; },
    deviceCall: (async (fn: (api: unknown, token: string) => Promise<unknown>) => fn(api, 'tok')) as SyncManagerPort['deviceCall'],
  };
  let seq = 0;
  const runtime = createSyncRuntime({
    db: store.db, manager, now: () => new Date('2026-03-01T00:00:00.000Z'), newOpId: () => `rt-op-${(seq += 1)}`,
    intervals: { debounceMs: 5, pollMs: 60_000, backoffMinMs: 20, backoffMaxMs: 80, reportMinIntervalMs: 60_000 },
    newToken: () => 'token-1',
  });
  runtimes.push(runtime);
  const applied: unknown[] = [];
  runtime.onApplied((c) => applied.push(...c));
  if (options.firstSync !== false) runtime.markFirstSyncDone();
  runtime.start();
  return {
    store, runtime, api, applied, commit,
    setHub(state: AgentHubStatus['state']) {
      hub = { ...hub, state, ...(state === 'revoked' ? { enrollment: { ...hub.enrollment!, state: 'revoked' as const } } : {}) };
      for (const l of [...hubListeners]) l(hub);
    },
    setProtocol(p: number) { protocol = p; },
    nudge() { for (const l of [...nudges]) l(1); },
    commitFavorite(id: string) { commitEntity(store.db, commit, { entityType: 'favorite', entityId: `tool:${id}`, op: 'upsert', payload: fav(id) }); },
  };
}

describe('gating', () => {
  it('does nothing before the first sync is done', async () => {
    const t = setup({ firstSync: false });
    t.commitFavorite('a');
    const status = await t.runtime.syncNow();
    expect(status.phase).toBe('needs-first-sync');
    expect(status.held).toBe(1);
    expect(t.api.syncPush).not.toHaveBeenCalled();
    expect(t.api.syncChanges).not.toHaveBeenCalled();
    t.runtime.markFirstSyncDone();
    await waitFor('push after first sync', () => t.api.syncPush.mock.calls.length > 0);
  });

  it('reports hub-outdated for a Hub that does not speak sync', async () => {
    const t = setup({ protocol: 1 });
    t.commitFavorite('a');
    expect((await t.runtime.syncNow()).phase).toBe('hub-outdated');
    expect(t.api.syncPush).not.toHaveBeenCalled();
  });

  it('is offline while the Hub connection is not online, and syncs once it comes online', async () => {
    const t = setup({ hubState: 'offline' });
    expect((await t.runtime.syncNow()).phase).toBe('offline');
    expect(t.api.syncChanges).not.toHaveBeenCalled();
    t.setHub('online');
    await waitFor('pull on reconnect', () => t.api.syncChanges.mock.calls.length > 0);
  });

  it('strands pending ops when the enrollment is revoked', async () => {
    const t = setup();
    t.setHub('offline');
    t.commitFavorite('a');
    t.setHub('revoked');
    expect(listOutbox(t.store.db, 10).map((o) => o.status)).toEqual(['stranded']);
    const status = await t.runtime.syncNow();
    expect(status).toMatchObject({ phase: 'revoked', stranded: 1, pending: 0 });
    expect(t.api.syncPush).not.toHaveBeenCalled();
  });

  it('pauses', async () => {
    const t = setup();
    expect(t.runtime.setPaused(true).phase).toBe('paused');
    t.commitFavorite('a');
    await t.runtime.syncNow();
    expect(t.api.syncPush).not.toHaveBeenCalled();
    t.runtime.setPaused(false);
    await waitFor('push after resume', () => t.api.syncPush.mock.calls.length > 0);
  });
});

describe('cycle', () => {
  it('pushes, pulls with the cursor persisted, emits applied changes and throttles the state report', async () => {
    const t = setup();
    t.api.syncChanges.mockResolvedValueOnce(changes([rec('favorite', 'tool:b', 5, fav('b', 2))], 5));
    t.commitFavorite('a');
    const status = await t.runtime.syncNow();
    expect(status).toMatchObject({ phase: 'idle', cursor: 5, pending: 0, lastSyncAt: '2026-03-01T00:00:00.000Z' });
    expect(t.api.syncPush).toHaveBeenCalledTimes(1);
    expect(listOutbox(t.store.db, 10)).toHaveLength(0);
    expect(getSyncState(t.store.db).cursor).toBe(5);
    expect(t.applied).toEqual([{ entityType: 'favorite', entityId: 'tool:b', deleted: false, payload: fav('b', 2) }]);
    expect(listRecords(t.store.db, 'favorite').map((r) => r.entityId).sort()).toEqual(['tool:a', 'tool:b']);
    expect(t.api.syncReportState).toHaveBeenCalledTimes(1);
    expect(t.api.syncReportState.mock.calls[0]![1]).toMatchObject({ cursor: 5, pending: 0, quarantined: 0, conflicts: 0 });
    // Nothing changed: the next cycle does not report again within the throttle window.
    await t.runtime.syncNow();
    expect(t.api.syncChanges.mock.calls[1]![1]).toBe(5);
    expect(t.api.syncReportState).toHaveBeenCalledTimes(1);
    // Counts changed (a quarantined op would, here a new cursor): reports again.
    t.api.syncChanges.mockResolvedValueOnce(changes([rec('favorite', 'tool:c', 6, fav('c', 3))], 6));
    await t.runtime.syncNow();
    expect(t.api.syncReportState).toHaveBeenCalledTimes(2);
  });

  it('pages through changes until hasMore is false', async () => {
    const t = setup();
    t.api.syncChanges
      .mockResolvedValueOnce(changes([rec('favorite', 'tool:a', 1, fav('a'))], 1, { hasMore: true }))
      .mockResolvedValueOnce(changes([rec('favorite', 'tool:b', 2, fav('b'))], 2));
    await t.runtime.syncNow();
    expect(t.api.syncChanges.mock.calls.map((c) => c[1])).toEqual([0, 1]);
    expect(getSyncState(t.store.db).cursor).toBe(2);
  });

  it('runs one cycle at a time and coalesces triggers', async () => {
    const t = setup();
    let concurrent = 0;
    let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    t.api.syncChanges.mockImplementation(async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await gate;
      concurrent -= 1;
      return changes([], 0);
    });
    const first = t.runtime.syncNow();
    await waitFor('first pull started', () => t.api.syncChanges.mock.calls.length === 1);
    t.nudge();
    t.nudge();
    t.commitFavorite('x');
    const second = t.runtime.syncNow();
    const third = t.runtime.syncNow();
    release();
    await Promise.all([first, second, third]);
    expect(peak).toBe(1);
    // One cycle for the first call plus one coalesced follow-up for everything requested meanwhile (push of x + its pull).
    await waitFor('settled', () => t.runtime.status().phase === 'idle' && t.api.syncChanges.mock.calls.length >= 2);
    expect(t.api.syncChanges.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('retries with bounded exponential backoff and surfaces lastError, then recovers', async () => {
    const t = setup();
    const times: number[] = [];
    t.api.syncChanges.mockImplementation(async () => {
      times.push(Date.now());
      if (times.length <= 4) throw new HubManagerError('hub-unreachable', 'down');
      return changes([], 0);
    });
    const status = await t.runtime.syncNow();
    expect(status).toMatchObject({ phase: 'offline', lastError: 'down' });
    await waitFor('recovery', () => times.length === 5 && t.runtime.status().phase === 'idle');
    const gaps = times.slice(1).map((time, i) => time - times[i]!);
    expect(gaps[0]).toBeGreaterThanOrEqual(15);
    expect(gaps[1]).toBeGreaterThanOrEqual(gaps[0]! - 5);
    // Capped at backoffMaxMs (80) plus scheduling slack.
    expect(Math.max(...gaps)).toBeLessThan(400);
    expect(t.runtime.status().lastError).toBeNull();
  });

  it('shows an error phase for a server failure and does not retry a revoked enrollment', async () => {
    const t = setup();
    t.api.syncChanges.mockRejectedValue(new HubApiError(503, 'unavailable', 'busy'));
    expect(await t.runtime.syncNow()).toMatchObject({ phase: 'error' });
    t.api.syncChanges.mockReset();
    t.api.syncChanges.mockRejectedValue(new HubManagerError('enrollment-revoked', 'revoked'));
    await t.runtime.syncNow();
    const calls = t.api.syncChanges.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(t.api.syncChanges.mock.calls.length).toBe(calls);
  });

  it('rebases from a snapshot when the cursor expired, then pulls changes from the first page as-of revision', async () => {
    const t = setup();
    // A previously synced favorite the Hub no longer has, and one it still has.
    t.api.syncChanges.mockResolvedValueOnce(changes([rec('favorite', 'tool:gone', 2, fav('gone')), rec('favorite', 'tool:keep', 3, fav('keep'))], 3));
    await t.runtime.syncNow();
    t.api.syncChanges.mockReset();
    t.api.syncChanges
      .mockRejectedValueOnce(new HubApiError(410, 'cursor-expired', 'expired'))
      .mockResolvedValueOnce(changes([rec('favorite', 'tool:late', 12, fav('late'))], 12, { floor: 4 }));
    t.api.syncSnapshot
      .mockResolvedValueOnce({ records: [rec('favorite', 'tool:keep', 10, fav('keep', 1))], asOfRevision: 10, next: { afterType: 'favorite', afterId: 'tool:keep' }, floor: 4 })
      .mockResolvedValueOnce({ records: [rec('pipeline', 'p1', 11, pipe('p1'))], asOfRevision: 11, next: null, floor: 4 });
    const status = await t.runtime.syncNow();
    expect(t.api.syncSnapshot).toHaveBeenCalledTimes(2);
    expect(t.api.syncChanges.mock.calls[1]![1]).toBe(10);
    expect(status).toMatchObject({ phase: 'idle', cursor: 12 });
    expect(listRecords(t.store.db, 'favorite').map((r) => r.entityId).sort()).toEqual(['tool:keep', 'tool:late']);
    expect(listRecords(t.store.db, 'pipeline')).toHaveLength(1);
    expect(t.applied).toContainEqual({ entityType: 'favorite', entityId: 'tool:gone', deleted: true, payload: null });
  });

  it('drops pulled records of disabled categories, keeps local rows, and rebases when the category is re-enabled', async () => {
    const t = setup();
    t.api.syncChanges.mockResolvedValueOnce(changes([rec('favorite', 'tool:a', 1, fav('a'))], 1));
    await t.runtime.syncNow();
    t.runtime.setCategories({ favorites: false });
    t.api.syncChanges.mockResolvedValueOnce(changes([rec('favorite', 'tool:b', 2, fav('b')), rec('pipeline', 'p1', 3, pipe('p1'))], 3));
    await t.runtime.syncNow();
    expect(listRecords(t.store.db, 'favorite').map((r) => r.entityId)).toEqual(['tool:a']);
    expect(listRecords(t.store.db, 'pipeline')).toHaveLength(1);
    expect(getSyncState(t.store.db).cursor).toBe(3);
    // A snapshot while disabled never deletes the disabled category's local rows either (covered by re-enabling below).
    t.api.syncSnapshot.mockResolvedValueOnce({
      records: [rec('favorite', 'tool:a', 1, fav('a')), rec('favorite', 'tool:b', 2, fav('b'))], asOfRevision: 3, next: null, floor: 0,
    });
    t.runtime.setCategories({ favorites: true });
    await waitFor('rebase on enable', () => t.api.syncSnapshot.mock.calls.length === 1);
    await waitFor('idle', () => t.runtime.status().phase === 'idle');
    expect(listRecords(t.store.db, 'favorite').map((r) => r.entityId).sort()).toEqual(['tool:a', 'tool:b']);
  });

  it('keeps local rows of a disabled category through a snapshot rebase', async () => {
    const t = setup();
    t.api.syncChanges.mockResolvedValueOnce(changes([rec('favorite', 'tool:a', 1, fav('a'))], 1));
    await t.runtime.syncNow();
    t.runtime.setCategories({ favorites: false });
    t.api.syncChanges.mockReset();
    t.api.syncChanges.mockRejectedValueOnce(new HubApiError(410, 'cursor-expired', 'expired')).mockResolvedValue(changes([], 5));
    t.api.syncSnapshot.mockResolvedValueOnce({ records: [], asOfRevision: 5, next: null, floor: 0 });
    await t.runtime.syncNow();
    expect(listRecords(t.store.db, 'favorite').map((r) => r.entityId)).toEqual(['tool:a']);
  });

  it('counts schema-newer records as deferred: the cursor advances and lastError says needs-update', async () => {
    const t = setup();
    t.api.syncChanges.mockResolvedValueOnce(changes([{ ...rec('pipeline', 'p1', 4, pipe('p1')), schemaVersion: 99 }], 4));
    const status = await t.runtime.syncNow();
    expect(status).toMatchObject({ cursor: 4, lastError: 'needs-update' });
    expect(listRecords(t.store.db, 'pipeline')).toHaveLength(0);
  });
});

describe('quarantine discard', () => {
  it('requires the preview token, once', async () => {
    const t = setup();
    t.api.syncPush.mockImplementationOnce(async (_t, ops) => ({ results: ops.map((o) => ({ opId: o.opId, status: 'rejected' as const, reason: 'invalid-payload' as const })), headRevision: 1 }));
    t.commitFavorite('a');
    await t.runtime.syncNow();
    const [op] = t.runtime.listQuarantined();
    expect(op).toMatchObject({ entityId: 'tool:a', reason: 'invalid-payload', category: 'favorites' });
    expect(() => t.runtime.discard(op!.opId, 'nope')).toThrow(/expired/);
    const preview = t.runtime.discardPreview(op!.opId);
    expect(preview.confirmToken).toBe('token-1');
    t.runtime.discard(op!.opId, 'token-1');
    expect(listOutbox(t.store.db, 10)).toHaveLength(0);
    expect(() => t.runtime.discard(op!.opId, 'token-1')).toThrow();
  });
});
