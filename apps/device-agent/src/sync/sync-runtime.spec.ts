import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubApiError } from '@dude/api-client';
import type { AgentHubStatus } from '@dude/contracts';
import type { SyncOpResult, SyncRecord, SyncSnapshotResponse } from '@dude/contracts/hub';
import { cleanupTemp, commitContext, openReady, tempDir } from '../testing/test-utils.js';
import { commitEntity } from '../store/entity-commit.js';
import { getEnrollment, raiseAuthorityEpoch, saveEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { listConflicts } from '../store/repos/sync-conflicts.repo.js';
import { listOutbox } from '../store/repos/outbox.repo.js';
import { listRecords } from '../store/repos/records.repo.js';
import { getReconcileRequired, getSyncState, resetHubBookkeeping } from '../store/repos/sync-state.repo.js';
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

function setup(options: { protocol?: number; hubState?: AgentHubStatus['state']; firstSync?: boolean; backupDir?: string } = {}) {
  const store = openReady(tempDir());
  saveEnrollment(store.db, ENROLL, T0);
  const commit = commitContext(store);
  let hub: AgentHubStatus = {
    state: options.hubState ?? 'online', lastError: null, lastContactAt: null, ownerSignedIn: false, hubVersion: '1', recoveryTrusted: null,  pendingOps: 0, authority: null,
    enrollment: {
      state: 'enrolled', hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: 'https://hub.lan:8443', protocolVersion: 2, spkiActive: 'spki-a',
      spkiNext: null, enrolledAt: T0.toISOString(), lastContactAt: null, revokedAt: null, authorityEpoch: 1,
    },
  };
  let protocol = options.protocol ?? 2;
  const hubListeners = new Set<(s: AgentHubStatus) => void>();
  const nudges = new Set<(rev: number) => void>();
  const api = {
    syncPush: vi.fn(async (_t: string, ops: readonly { opId: string }[]): Promise<{ results: SyncOpResult[]; headRevision: number }> => ({ results: ops.map((o, i) => ({ opId: o.opId, status: 'applied' as const, revision: i + 1 })), headRevision: 9 })),
    // An idle Hub echoes the caller's cursor back (its head is never behind what the caller already consumed).
    syncChanges: vi.fn(async (_t: string, after: number, _limit?: number): Promise<ReturnType<typeof changes>> => changes([], after)),
    syncSnapshot: vi.fn(async (_t: string, _page?: unknown): Promise<SyncSnapshotResponse> => ({ records: [], asOfRevision: 0, next: null, floor: 0 })),
    syncReportState: vi.fn(async (_t: string, r: unknown): Promise<{ floor: number; headRevision: number; retentionDays: number; authorityEpoch?: number }> => ({ floor: 0, headRevision: Math.max(9, (r as { cursor?: number }).cursor ?? 0), retentionDays: 90 })),
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
    ...(options.backupDir ? { backupDir: options.backupDir } : {}),
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
    setAuthorityChanged(reason: 'transferred' | 'instance-changed' | 'epoch-lower' = 'instance-changed', hubInstanceId: string | null = 'hub-2', epoch: number | null = 2) {
      hub = { ...hub, state: 'authority-changed', authority: { reason, hubInstanceId, epoch }, lastError: 'The Hub changed.' };
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

  it('needs-reconcile blocks every cycle, keeps all data and takes one recovery snapshot per changed authority', async () => {
    const backupDir = path.join(tempDir(), 'backups');
    const t = setup({ backupDir });
    t.commitFavorite('a');
    const snapshots = (): string[] => (existsSync(backupDir) ? readdirSync(backupDir).filter((f) => f.startsWith('authority-changed-')) : []);
    await waitFor('first push', () => t.api.syncPush.mock.calls.length > 0);
    t.api.syncPush.mockClear();
    t.api.syncChanges.mockClear();
    t.setAuthorityChanged();
    t.commitFavorite('b');
    const status = await t.runtime.syncNow();
    expect(status).toMatchObject({ phase: 'needs-reconcile', lastError: 'The Hub changed.' });
    expect(t.api.syncPush).not.toHaveBeenCalled();
    expect(t.api.syncChanges).not.toHaveBeenCalled();
    expect(snapshots()).toHaveLength(1);
    expect(listRecords(t.store.db, 'favorite')).toHaveLength(2);
    expect(listOutbox(t.store.db, 10).filter((o) => o.status === 'pending')).toHaveLength(1);

    // The same changed authority again (more notices, a re-run) does not repeat the snapshot.
    t.setAuthorityChanged();
    await t.runtime.syncNow();
    expect(snapshots()).toHaveLength(1);
    expect(t.api.syncPush).not.toHaveBeenCalled();
  });

  it('does not repeat the recovery snapshot after a restart of the runtime', async () => {
    const backupDir = path.join(tempDir(), 'backups');
    const t = setup({ backupDir });
    t.setAuthorityChanged();
    await t.runtime.syncNow();
    expect(readdirSync(backupDir)).toHaveLength(1);
    t.runtime.stop();
    t.runtime.start();
    await t.runtime.syncNow();
    expect(readdirSync(backupDir)).toHaveLength(1);
  });

  it('needs-reconcile comes after revoked and before offline', async () => {
    const t = setup();
    t.setAuthorityChanged();
    expect((await t.runtime.syncNow()).phase).toBe('needs-reconcile');
    t.setHub('revoked');
    expect((await t.runtime.syncNow()).phase).toBe('revoked');
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

  it('reports the paused flag in the state report, immediately on pause and again when it changes', async () => {
    const t = setup();
    t.runtime.setPaused(true);
    await waitFor('paused report', () => t.api.syncReportState.mock.calls.length === 1);
    expect(t.api.syncReportState.mock.calls[0]![1]).toMatchObject({ paused: true });
    t.runtime.setPaused(false);
    await waitFor('resumed report', () => t.api.syncReportState.mock.calls.some((c) => (c[1] as { paused: boolean }).paused === false));
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

describe('reconcile flag (PD-073)', () => {
  const snapshotFiles = (dir: string, prefix: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.db')) : []);
  const cursorAt = (t: ReturnType<typeof setup>, revision: number) => {
    t.api.syncChanges.mockResolvedValueOnce(changes([rec('favorite', 'tool:b', revision, fav('b', 2))], revision));
    return t.runtime.syncNow();
  };

  it('a Hub head behind the cursor blocks sync without applying the page, keeps data, and snapshots once', async () => {
    const backupDir = path.join(tempDir(), 'backups');
    const t = setup({ backupDir });
    await cursorAt(t, 5);
    expect(getSyncState(t.store.db).cursor).toBe(5);
    t.api.syncChanges.mockResolvedValueOnce(changes([rec('favorite', 'tool:x', 3, fav('x'))], 3));
    const status = await t.runtime.syncNow();
    expect(status).toMatchObject({ phase: 'needs-reconcile', cursor: 5 });
    expect(status.lastError).toMatch(/less history/);
    expect(getReconcileRequired(t.store.db)).toMatchObject({ reason: 'cursor-ahead', detail: { cursor: 5, headRevision: 3 } });
    expect(listRecords(t.store.db, 'favorite').map((r) => r.entityId)).toEqual(['tool:b']);
    expect(snapshotFiles(backupDir, 'sync-reconcile-')).toHaveLength(1);

    // Later runs (a nudge, another syncNow, a local commit) neither push nor pull, and do not snapshot again.
    t.api.syncPush.mockClear();
    t.api.syncChanges.mockClear();
    t.commitFavorite('c');
    t.nudge();
    expect((await t.runtime.syncNow()).phase).toBe('needs-reconcile');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(t.api.syncPush).not.toHaveBeenCalled();
    expect(t.api.syncChanges).not.toHaveBeenCalled();
    expect(snapshotFiles(backupDir, 'sync-reconcile-')).toHaveLength(1);
    expect(listOutbox(t.store.db, 10).filter((o) => o.status === 'pending')).toHaveLength(1);

    // The reconnect flow resets the Hub bookkeeping, which clears the flag.
    resetHubBookkeeping(t.store.db);
    expect(getReconcileRequired(t.store.db)).toBeNull();
  });

  it('the flag is persisted: a restarted runtime is still blocked and does not snapshot again', async () => {
    const backupDir = path.join(tempDir(), 'backups');
    const t = setup({ backupDir });
    await cursorAt(t, 5);
    t.api.syncChanges.mockResolvedValueOnce(changes([], 2));
    expect((await t.runtime.syncNow()).phase).toBe('needs-reconcile');
    t.runtime.stop();
    t.api.syncPush.mockClear();
    t.api.syncChanges.mockClear();
    t.runtime.start();
    expect((await t.runtime.syncNow()).phase).toBe('needs-reconcile');
    expect(t.api.syncChanges).not.toHaveBeenCalled();
    expect(snapshotFiles(backupDir, 'sync-reconcile-')).toHaveLength(1);
  });

  it('a push response whose head is behind the cursor stops the cycle and leaves the outbox untouched', async () => {
    const t = setup();
    await cursorAt(t, 5);
    t.api.syncPush.mockImplementationOnce(async (_t, ops) => ({ results: ops.map((o) => ({ opId: o.opId, status: 'applied' as const, revision: 1 })), headRevision: 2 }));
    t.commitFavorite('c');
    t.api.syncChanges.mockClear();
    expect((await t.runtime.syncNow()).phase).toBe('needs-reconcile');
    expect(getReconcileRequired(t.store.db)).toMatchObject({ reason: 'cursor-ahead', detail: { cursor: 5, headRevision: 2 } });
    expect(t.api.syncChanges).not.toHaveBeenCalled();
    expect(listOutbox(t.store.db, 10).map((o) => o.status)).toEqual(['pending']);
  });

  it('a state report whose head is behind the cursor raises the flag', async () => {
    const t = setup();
    t.api.syncReportState.mockResolvedValueOnce({ floor: 0, headRevision: 1, retentionDays: 90 });
    await cursorAt(t, 5);
    expect(t.runtime.status().phase).toBe('needs-reconcile');
    expect(getReconcileRequired(t.store.db)).toMatchObject({ reason: 'cursor-ahead' });
  });

  it('a lower authority epoch in a sync response blocks and the page is not applied', async () => {
    const backupDir = path.join(tempDir(), 'backups');
    const t = setup({ backupDir });
    raiseAuthorityEpoch(t.store.db, 2, T0);
    t.api.syncChanges.mockResolvedValueOnce(changes([rec('favorite', 'tool:x', 6, fav('x'))], 6, { authorityEpoch: 1 }));
    expect((await t.runtime.syncNow()).phase).toBe('needs-reconcile');
    expect(getReconcileRequired(t.store.db)).toMatchObject({ reason: 'epoch-lower', detail: { epoch: 1, storedEpoch: 2 } });
    expect(listRecords(t.store.db, 'favorite')).toHaveLength(0);
    expect(getSyncState(t.store.db).cursor).toBe(0);
    expect(snapshotFiles(backupDir, 'sync-reconcile-')).toHaveLength(1);
    t.api.syncChanges.mockClear();
    await t.runtime.syncNow();
    expect(t.api.syncChanges).not.toHaveBeenCalled();
  });

  it('a higher authority epoch is recorded and sync continues; a response without an epoch is no information', async () => {
    const t = setup();
    t.api.syncChanges.mockResolvedValueOnce(changes([rec('favorite', 'tool:x', 6, fav('x'))], 6, { authorityEpoch: 3 }));
    expect(await t.runtime.syncNow()).toMatchObject({ phase: 'idle', cursor: 6 });
    expect(getEnrollment(t.store.db)?.authorityEpoch).toBe(3);
    expect(getReconcileRequired(t.store.db)).toBeNull();
    await cursorAt(t, 7);
    expect(getEnrollment(t.store.db)?.authorityEpoch).toBe(3);
    expect(t.runtime.status().phase).toBe('idle');
  });

  it('a normal Hub (head at or above the cursor, including cursor 0) behaves as before', async () => {
    const backupDir = path.join(tempDir(), 'backups');
    const t = setup({ backupDir });
    expect(await t.runtime.syncNow()).toMatchObject({ phase: 'idle', cursor: 0 });
    await cursorAt(t, 5);
    t.api.syncChanges.mockResolvedValueOnce(changes([], 5, { headRevision: 9 }));
    expect(await t.runtime.syncNow()).toMatchObject({ phase: 'idle', cursor: 5 });
    expect(getReconcileRequired(t.store.db)).toBeNull();
    expect(snapshotFiles(backupDir, '')).toHaveLength(0);
  });

  describe('rebase safety', () => {
    /** A favorite the Hub acknowledged at `revision` (through a push response), then a cursor-expired pull that triggers a rebase. */
    async function ackedThenRebase(t: ReturnType<typeof setup>, revision: number, asOfRevision: number): Promise<void> {
      t.api.syncPush.mockImplementationOnce(async (_t, ops) => ({ results: ops.map((o) => ({ opId: o.opId, status: 'applied' as const, revision })), headRevision: revision }));
      t.commitFavorite('a');
      await t.runtime.syncNow();
      expect(listOutbox(t.store.db, 10)).toHaveLength(0);
      t.api.syncChanges.mockRejectedValueOnce(new HubApiError(410, 'cursor-expired', 'expired'));
      t.api.syncSnapshot.mockResolvedValueOnce({ records: [], asOfRevision, next: null, floor: 0 });
    }

    it('an entity acknowledged above the snapshot as-of revision is kept and the flag is raised (history regressed)', async () => {
      const backupDir = path.join(tempDir(), 'backups');
      const t = setup({ backupDir });
      await ackedThenRebase(t, 120, 100);
      const before = JSON.stringify(listRecords(t.store.db, 'favorite'));
      const status = await t.runtime.syncNow();
      expect(status).toMatchObject({ phase: 'needs-reconcile', cursor: 0 });
      expect(JSON.stringify(listRecords(t.store.db, 'favorite'))).toBe(before);
      expect(listRecords(t.store.db, 'favorite')).toHaveLength(1);
      expect(getReconcileRequired(t.store.db)).toMatchObject({ reason: 'history-regressed', detail: { maxRevision: 120, asOfRevision: 100 } });
      expect(getSyncState(t.store.db).cursor).toBe(0);
      expect(listConflicts(t.store.db)).toHaveLength(0);
      expect(snapshotFiles(backupDir, 'rebase-')).toHaveLength(0);
      expect(snapshotFiles(backupDir, 'sync-reconcile-')).toHaveLength(1);
      // Not an error loop: no retry is scheduled.
      t.api.syncSnapshot.mockClear();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(t.api.syncSnapshot).not.toHaveBeenCalled();
      expect(t.runtime.status().phase).toBe('needs-reconcile');
    });

    it('a legitimate deletion still happens, with an edit-delete conflict for a pending edit, after a rebase recovery snapshot', async () => {
      const backupDir = path.join(tempDir(), 'backups');
      const t = setup({ backupDir });
      await ackedThenRebase(t, 50, 100);
      // A local edit that the Hub never received (the push answers with no results, so the op stays pending).
      t.api.syncPush.mockResolvedValueOnce({ results: [], headRevision: 100 });
      commitEntity(t.store.db, t.commit, { entityType: 'favorite', entityId: 'tool:a', op: 'upsert', payload: fav('a', 7) });
      const status = await t.runtime.syncNow();
      expect(status.phase).toBe('idle');
      expect(listRecords(t.store.db, 'favorite')).toHaveLength(0);
      expect(listConflicts(t.store.db)[0]).toMatchObject({ kind: 'edit-delete', entityId: 'tool:a' });
      expect(getSyncState(t.store.db).cursor).toBe(100);
      expect(snapshotFiles(backupDir, 'rebase-')).toHaveLength(1);
      expect(getReconcileRequired(t.store.db)).toBeNull();
    });

    it('a rebase with nothing to delete takes no recovery snapshot', async () => {
      const backupDir = path.join(tempDir(), 'backups');
      const t = setup({ backupDir });
      t.api.syncChanges.mockRejectedValueOnce(new HubApiError(410, 'cursor-expired', 'expired'));
      t.api.syncSnapshot.mockResolvedValueOnce({ records: [], asOfRevision: 10, next: null, floor: 0 });
      expect((await t.runtime.syncNow()).phase).toBe('idle');
      expect(snapshotFiles(backupDir, '')).toHaveLength(0);
    });

    it('a failing recovery snapshot aborts the rebase before anything is deleted', async () => {
      const dir = tempDir();
      const blocker = path.join(dir, 'not-a-directory');
      writeFileSync(blocker, 'x');
      const t = setup({ backupDir: path.join(blocker, 'backups') });
      await ackedThenRebase(t, 50, 100);
      const status = await t.runtime.syncNow();
      expect(status.phase).toBe('error');
      expect(listRecords(t.store.db, 'favorite')).toHaveLength(1);
      expect(getSyncState(t.store.db).cursor).toBe(0);
      expect(getReconcileRequired(t.store.db)).toBeNull();
    });
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
