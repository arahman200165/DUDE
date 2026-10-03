import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentMethod, AgentMethodMap, AgentResponse } from '@dude/contracts';
import { getMeta } from '@dude/sqlite-store';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import { clearEnrollment, getEnrollment, saveEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { listOutbox } from '../store/repos/outbox.repo.js';
import { getSyncState, updateSyncState } from '../store/repos/sync-state.repo.js';
import type { HubRuntime } from '../hub/index.js';
import { createRpcServer } from './server.js';

/** Sync lifecycle on the RPC surface: unenroll -> standalone, Clear data (enrolled, optionally also on the Hub) and Reset = unenroll. */
afterEach(cleanupTemp);

const T0 = new Date('2026-02-01T00:00:00.000Z');
const ENROLL = {
  hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: 'https://hub.lan:8443', protocolVersion: 2, spkiActive: 'spki-a', certActivePem: 'PEM-A',
  keyId: 'key-1', publicKey: new Uint8Array([1]), wrappedPrivateKey: new Uint8Array([2]), enrolledAt: T0.toISOString(),
};
const deps = { now: () => new Date(), randomBytes: (n: number) => new Uint8Array(randomBytes(n)) };
let nextId = 1;

function make(options: { signedIn?: boolean; unenroll?: 'ok' | 'unreachable' | 'still-listed' } = {}) {
  const store = openReady(tempDir());
  saveEnrollment(store.db, ENROLL, T0);
  const api = {
    syncClearPreview: vi.fn(async (_t: string) => ({ confirmationId: 'conf-1', recordCount: 7, deviceCount: 2, expiresAt: '2030-01-01T00:00:00.000Z' })),
    syncClear: vi.fn(async (_t: string, _id: string) => ({ deleted: 7, headRevision: 99 })),
  };
  const unenroll = vi.fn(async (_options?: { force?: boolean }) => {
    if (options.unenroll === 'unreachable') throw new Error('hub down');
    clearEnrollment(store.db);
    return { hubStillListsDevice: options.unenroll === 'still-listed' };
  });
  const resetToStandalone = vi.fn();
  const hub = {
    manager: {
      owner: {
        status: () => ({ signedIn: options.signedIn !== false, displayName: 'owner', expiresAt: null }),
        withOwner: async <T>(fn: (a: typeof api, token: string) => Promise<T>) => fn(api, 'owner-token'),
        clear: vi.fn(),
      },
      unenroll, resetToStandalone,
    },
  } as unknown as HubRuntime;
  const server = createRpcServer(store, { ...deps, hub });
  async function call<M extends AgentMethod>(method: M, params: AgentMethodMap[M]['params'] = {} as AgentMethodMap[M]['params']): Promise<AgentResponse<M>> {
    return await server.handle({ id: nextId++, method, params }) as AgentResponse<M>;
  }
  const favorite = async (id: string) => call('entity.commit', { entityType: 'favorite', entityId: `tool:${id}`, op: 'upsert', payload: { id: `tool:${id}`, kind: 'tool', targetId: id, order: 0 } });
  const records = (): number => Number((store.db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n);
  return { store, api, call, favorite, records, unenroll, resetToStandalone };
}

function ok<M extends AgentMethod>(response: AgentResponse<M>): AgentMethodMap[M]['result'] {
  if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
  return response.result;
}

describe('unenroll', () => {
  it('converts to standalone and keeps the data under a fresh environment', async () => {
    const t = make();
    ok(await t.favorite('a'));
    ok(await t.favorite('b'));
    updateSyncState(t.store.db, { firstSyncState: 'done', cursor: 9 });
    const result = ok(await t.call('hub.unenroll', {}));
    expect(result).toEqual({ ok: true, hubStillListsDevice: false, droppedOps: 2 });
    expect(getEnrollment(t.store.db)).toBeNull();
    expect(listOutbox(t.store.db, 100)).toEqual([]);
    expect(t.records()).toBe(2);
    const environment = getMeta(t.store.db, 'environment_id');
    expect(environment).not.toBe('env-hub');
    expect(t.store.db.prepare('SELECT COUNT(*) AS n FROM records WHERE environment_id = ?').get(environment as string)).toEqual({ n: 2 });
    expect(getSyncState(t.store.db)).toMatchObject({ firstSyncState: 'pending', cursor: 0 });
  });
});

describe('clear data on an enrolled device', () => {
  it('discloses unsent ops, keeps the enrollment, journals no deletes and re-pulls a snapshot', async () => {
    const t = make();
    ok(await t.favorite('a'));
    updateSyncState(t.store.db, { firstSyncState: 'done', cursor: 9, categories: { usage: true, scratchpad: true } });
    const preview = ok(await t.call('reset.preview', { kind: 'clear-data' }));
    expect(preview).toMatchObject({ enrolled: true, pendingOps: 1, unsent: { pending: 1, quarantined: 0, stranded: 0 } });
    expect(preview.hub).toBeUndefined();
    expect(ok(await t.call('reset.apply', { kind: 'clear-data', digest: preview.digest }))).toEqual({ ok: true });
    expect(getEnrollment(t.store.db)?.state).toBe('enrolled');
    expect(t.records()).toBe(0);
    expect(listOutbox(t.store.db, 100)).toEqual([]);
    expect(getMeta(t.store.db, 'sync_rebase_pending')).toBe('1');
    expect(getSyncState(t.store.db)).toMatchObject({ firstSyncState: 'done', cursor: 0 });
    expect(getSyncState(t.store.db).categories).toMatchObject({ usage: true, scratchpad: true });
    expect(t.api.syncClear).not.toHaveBeenCalled();
  });

  it('a standalone clear-data neither sets a rebase nor needs a Hub', async () => {
    const t = make();
    clearEnrollment(t.store.db);
    ok(await t.favorite('a'));
    const preview = ok(await t.call('reset.preview', { kind: 'clear-data' }));
    expect(preview).toMatchObject({ enrolled: false });
    ok(await t.call('reset.apply', { kind: 'clear-data', digest: preview.digest }));
    expect(getMeta(t.store.db, 'sync_rebase_pending')).toBeUndefined();
  });
});

describe('also delete from the Hub', () => {
  it('needs an owner session and an enrollment', async () => {
    const signedOut = make({ signedIn: false });
    const refused = await signedOut.call('reset.preview', { kind: 'clear-data', deleteFromHub: true });
    expect(refused).toMatchObject({ ok: false, error: { code: 'owner-session-required' } });
    expect(signedOut.api.syncClearPreview).not.toHaveBeenCalled();

    const standalone = make();
    clearEnrollment(standalone.store.db);
    expect(await standalone.call('reset.preview', { kind: 'clear-data', deleteFromHub: true })).toMatchObject({ ok: false, error: { code: 'not-enrolled' } });
    expect(await standalone.call('reset.preview', { kind: 'reset-device', deleteFromHub: true })).toMatchObject({ ok: false, error: { code: 'invalid-params' } });
  });

  it('calls the Hub preview, then clear with its confirmation id, then wipes locally', async () => {
    const t = make();
    ok(await t.favorite('a'));
    const preview = ok(await t.call('reset.preview', { kind: 'clear-data', deleteFromHub: true }));
    expect(preview.hub).toEqual({ recordCount: 7, deviceCount: 2, confirmationId: 'conf-1', expiresAt: '2030-01-01T00:00:00.000Z' });
    expect(t.api.syncClear).not.toHaveBeenCalled();
    expect(t.records()).toBe(1);
    expect(ok(await t.call('reset.apply', { kind: 'clear-data', digest: preview.digest, deleteFromHub: true }))).toEqual({ ok: true, hubDeleted: 7 });
    expect(t.api.syncClear).toHaveBeenCalledExactlyOnceWith('owner-token', 'conf-1');
    expect(t.records()).toBe(0);
    expect(getEnrollment(t.store.db)?.state).toBe('enrolled');
    // Single use: the Hub plan is spent.
    const again = await t.call('reset.apply', { kind: 'clear-data', digest: preview.digest, deleteFromHub: true });
    expect(again).toMatchObject({ ok: true, result: { ok: false, error: 'stale-preview' } });
    expect(t.api.syncClear).toHaveBeenCalledTimes(1);
  });

  it('a Hub failure aborts the whole apply and nothing local is wiped', async () => {
    const t = make();
    ok(await t.favorite('a'));
    const preview = ok(await t.call('reset.preview', { kind: 'clear-data', deleteFromHub: true }));
    t.api.syncClear.mockRejectedValueOnce(new Error('Hub unavailable'));
    const result = await t.call('reset.apply', { kind: 'clear-data', digest: preview.digest, deleteFromHub: true });
    expect(result.ok).toBe(false);
    expect(t.records()).toBe(1);
    expect(listOutbox(t.store.db, 100)).toHaveLength(1);
    expect(getMeta(t.store.db, 'sync_rebase_pending')).toBeUndefined();
  });

  it('a preview without deleteFromHub cannot be applied with it (and vice versa)', async () => {
    const t = make();
    ok(await t.favorite('a'));
    const plain = ok(await t.call('reset.preview', { kind: 'clear-data' }));
    expect(ok(await t.call('reset.apply', { kind: 'clear-data', digest: plain.digest, deleteFromHub: true }))).toEqual({ ok: false, error: 'stale-preview' });
    const withHub = ok(await t.call('reset.preview', { kind: 'clear-data', deleteFromHub: true }));
    expect(ok(await t.call('reset.apply', { kind: 'clear-data', digest: withHub.digest }))).toEqual({ ok: false, error: 'stale-preview' });
    expect(t.api.syncClear).not.toHaveBeenCalled();
    expect(t.records()).toBe(1);
  });

  it('local data that changed after the preview never reaches the Hub call', async () => {
    const t = make();
    ok(await t.favorite('a'));
    const preview = ok(await t.call('reset.preview', { kind: 'clear-data', deleteFromHub: true }));
    ok(await t.favorite('b'));
    expect(ok(await t.call('reset.apply', { kind: 'clear-data', digest: preview.digest, deleteFromHub: true }))).toEqual({ ok: false, error: 'stale-preview' });
    expect(t.api.syncClear).not.toHaveBeenCalled();
  });
});

describe('reset this device', () => {
  it('unenrolls (best effort) before wiping, with a new identity', async () => {
    const t = make({ unenroll: 'still-listed' });
    ok(await t.favorite('a'));
    const device = getMeta(t.store.db, 'device_id');
    const preview = ok(await t.call('reset.preview', { kind: 'reset-device' }));
    expect(preview).toMatchObject({ enrolled: true, pendingOps: 1 });
    expect(ok(await t.call('reset.apply', { kind: 'reset-device', digest: preview.digest }))).toEqual({ ok: true, hubStillListsDevice: true });
    expect(t.unenroll).toHaveBeenCalledWith({ force: true });
    expect(t.resetToStandalone).toHaveBeenCalled();
    expect(getEnrollment(t.store.db)).toBeNull();
    expect(t.records()).toBe(0);
    expect(getMeta(t.store.db, 'device_id')).not.toBe(device);
    expect(t.api.syncClear).not.toHaveBeenCalled();
  });

  it('still resets when the Hub cannot be reached', async () => {
    const t = make({ unenroll: 'unreachable' });
    ok(await t.favorite('a'));
    const preview = ok(await t.call('reset.preview', { kind: 'reset-device' }));
    expect(ok(await t.call('reset.apply', { kind: 'reset-device', digest: preview.digest }))).toEqual({ ok: true, hubStillListsDevice: true });
    expect(getEnrollment(t.store.db)).toBeNull();
    expect(t.records()).toBe(0);
  });

  it('a stale preview unenrolls nothing', async () => {
    const t = make();
    ok(await t.favorite('a'));
    const preview = ok(await t.call('reset.preview', { kind: 'reset-device' }));
    ok(await t.favorite('b'));
    expect(ok(await t.call('reset.apply', { kind: 'reset-device', digest: preview.digest }))).toEqual({ ok: false, error: 'stale-preview' });
    expect(t.unenroll).not.toHaveBeenCalled();
    expect(getEnrollment(t.store.db)).not.toBeNull();
  });
});
