const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }));
vi.mock('electron', () => ({
  app: { getPath: () => '' },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
  shell: { openPath: vi.fn(async () => '') },
}));

import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTemp, openReady, tempDir } from '../../device-agent/src/testing/test-utils';
import { createRpcServer } from '../../device-agent/src/rpc/server';
import { saveEnrollment } from '../../device-agent/src/store/repos/hub-enrollment.repo';
import type { HubRuntime } from '../../device-agent/src/hub/index';
import { quarantineStore } from '../../device-agent/src/store/open-store';
import type { DeviceStoreHost } from './agent-host';
import { createInProcessClient } from './store-client';
import { registerStoreResetHandlers, RESET_TOKEN_TTL_MS } from './store-reset';

const own = { id: 7, reloadCount: 0 };
const foreign = { id: 8 };
const window = {
  webContents: Object.assign(own, { send: () => undefined, isDestroyed: () => false, reload: () => { own.reloadCount++; } }),
  isDestroyed: () => false,
} as any;

const deps = { now: () => new Date(), randomBytes: (n: number) => new Uint8Array(randomBytes(n)) };
const call = (channel: string, sender: unknown, ...args: unknown[]) => mock.handlers.get(channel)!({ sender }, ...args) as Promise<any>;
const kv = (key: string) => ({ namespace: 'tool.a', key, value: { x: 1 }, policy: 'local' as const });

let host: DeviceStoreHost;
const openPath = vi.fn(async (_path: string) => '');

async function counts(): Promise<number> {
  return (await host.call('store.hydrate', {})).kv.length;
}

beforeEach(() => {
  mock.handlers.clear();
  own.reloadCount = 0;
  openPath.mockClear();
  const store = openReady(tempDir(), { machineGuid: null });
  host = createInProcessClient(createRpcServer(store, deps).handle);
  registerStoreResetHandlers(window, { host: () => host, restartHost: async () => host, storeDir: () => 'C:/userData/device-store', openPath, now: () => new Date() });
});

afterEach(() => { vi.useRealTimers(); cleanupTemp(); });

const CHANNELS: Array<[string, unknown[]]> = [
  ['dude:store:reset:preview', ['clear-data']],
  ['dude:store:reset:apply', [{ kind: 'clear-data', token: 'x' }]],
  ['dude:store:recovery:openFolder', []],
  ['dude:store:recovery:quarantinePreview', []],
  ['dude:store:recovery:quarantineApply', ['x']],
];

describe('store reset confirmation boundary', () => {
  it.each(CHANNELS)('%s rejects a foreign sender', async (channel, args) => {
    await host.call('kv.commit', { mutations: [kv('a')] });
    const result = await call(channel, foreign, ...args);
    expect(result.ok).toBe(false);
    expect(result.error ?? 'forbidden').toBe('forbidden');
    expect(await counts()).toBe(1);
    expect(openPath).not.toHaveBeenCalled();
  });

  it('preview alone mutates nothing', async () => {
    await host.call('kv.commit', { mutations: [kv('a'), kv('b')] });
    const preview = await call('dude:store:reset:preview', own, 'clear-data');
    expect(preview).toMatchObject({ ok: true, kind: 'clear-data', keepsIdentity: true, wipesSecrets: false });
    expect(preview.counts.kv).toBe(2);
    expect(await counts()).toBe(2);
    expect(own.reloadCount).toBe(0);
  });

  it('apply without a token is rejected and wipes nothing', async () => {
    await host.call('kv.commit', { mutations: [kv('a')] });
    expect(await call('dude:store:reset:apply', own, { kind: 'clear-data' })).toEqual({ ok: false, error: 'invalid-token' });
    expect(await call('dude:store:reset:apply', own, { kind: 'clear-data', token: 'made-up' })).toEqual({ ok: false, error: 'expired' });
    expect(await call('dude:store:reset:apply', own, undefined)).toEqual({ ok: false, error: 'invalid-token' });
    expect(await counts()).toBe(1);
  });

  it('a token for one kind cannot apply the other', async () => {
    await host.call('kv.commit', { mutations: [kv('a')] });
    const preview = await call('dude:store:reset:preview', own, 'clear-data');
    expect(await call('dude:store:reset:apply', own, { kind: 'reset-device', token: preview.token })).toMatchObject({ ok: false });
    expect(await counts()).toBe(1);
  });

  it('applies with the previewed token, once, and reloads the window', async () => {
    await host.call('kv.commit', { mutations: [kv('a')] });
    const before = (await host.call('store.hydrate', {})).device!.deviceId;
    const preview = await call('dude:store:reset:preview', own, 'clear-data');
    expect(await call('dude:store:reset:apply', own, { kind: 'clear-data', token: preview.token })).toEqual({ ok: true });
    expect(await counts()).toBe(0);
    expect((await host.call('store.hydrate', {})).device!.deviceId).toBe(before);
    expect(own.reloadCount).toBe(1);
    await host.call('kv.commit', { mutations: [kv('b')] });
    // Replay of the used token.
    expect(await call('dude:store:reset:apply', own, { kind: 'clear-data', token: preview.token })).toMatchObject({ ok: false });
    expect(await counts()).toBe(1);
  });

  it('reset-device mints a new identity', async () => {
    const before = (await host.call('store.hydrate', {})).device!.deviceId;
    const preview = await call('dude:store:reset:preview', own, 'reset-device');
    expect(preview).toMatchObject({ keepsIdentity: false, wipesSecrets: true });
    expect(await call('dude:store:reset:apply', own, { kind: 'reset-device', token: preview.token })).toEqual({ ok: true });
    expect((await host.call('store.hydrate', {})).device!.deviceId).not.toBe(before);
  });

  it('another window cannot use the token (owner-bound)', async () => {
    await host.call('kv.commit', { mutations: [kv('a')] });
    const preview = await call('dude:store:reset:preview', own, 'clear-data');
    expect(await call('dude:store:reset:apply', foreign, { kind: 'clear-data', token: preview.token })).toEqual({ ok: false, error: 'forbidden' });
    expect(await counts()).toBe(1);
  });

  it('an expired token is rejected', async () => {
    vi.useFakeTimers();
    await host.call('kv.commit', { mutations: [kv('a')] });
    const preview = await call('dude:store:reset:preview', own, 'clear-data');
    vi.advanceTimersByTime(RESET_TOKEN_TTL_MS + 1);
    expect(await call('dude:store:reset:apply', own, { kind: 'clear-data', token: preview.token })).toEqual({ ok: false, error: 'expired' });
    expect(await counts()).toBe(1);
  });

  it('data changed since the preview surfaces stale-preview and wipes nothing', async () => {
    await host.call('kv.commit', { mutations: [kv('a')] });
    const preview = await call('dude:store:reset:preview', own, 'clear-data');
    await host.call('kv.commit', { mutations: [kv('b')] });
    expect(await call('dude:store:reset:apply', own, { kind: 'clear-data', token: preview.token })).toEqual({ ok: false, error: 'stale-preview' });
    expect(await counts()).toBe(2);
    expect(own.reloadCount).toBe(0);
  });

  describe('also delete from the Hub', () => {
    const api = {
      syncClearPreview: vi.fn(async (_t: string) => ({ confirmationId: 'conf-9', recordCount: 5, deviceCount: 2, expiresAt: '2030-01-01T00:00:00.000Z' })),
      syncClear: vi.fn(async (_t: string, _id: string) => ({ deleted: 5, headRevision: 1 })),
    };
    beforeEach(() => {
      api.syncClearPreview.mockClear();
      api.syncClear.mockClear();
      mock.handlers.clear();
      const store = openReady(tempDir(), { machineGuid: null });
      saveEnrollment(store.db, {
        hubInstanceId: 'hub-1', environmentId: 'env-hub', hubUrl: 'https://hub.lan:8443', protocolVersion: 2, spkiActive: 'a', certActivePem: 'P',
        keyId: 'k', publicKey: new Uint8Array([1]), wrappedPrivateKey: new Uint8Array([2]), enrolledAt: '2026-01-01T00:00:00.000Z',
      }, new Date());
      const hub = { manager: { owner: { status: () => ({ signedIn: true }), withOwner: async (fn: (a: typeof api, t: string) => Promise<unknown>) => fn(api, 'owner-token') } } } as unknown as HubRuntime;
      host = createInProcessClient(createRpcServer(store, { ...deps, hub }).handle);
      registerStoreResetHandlers(window, { host: () => host, restartHost: async () => host, storeDir: () => 'C:/userData/device-store', openPath, now: () => new Date() });
    });

    it('preview only previews: no Hub clear, nothing wiped, the Hub confirmation id never reaches the renderer', async () => {
      await host.call('kv.commit', { mutations: [kv('a')] });
      const preview = await call('dude:store:reset:preview', own, 'clear-data', { deleteFromHub: true });
      expect(preview).toMatchObject({ ok: true, enrolled: true, hub: { recordCount: 5, deviceCount: 2 } });
      expect(JSON.stringify(preview)).not.toContain('conf-9');
      expect(api.syncClear).not.toHaveBeenCalled();
      expect(await counts()).toBe(1);
    });

    it('a token from a preview without deleteFromHub cannot apply with it', async () => {
      await host.call('kv.commit', { mutations: [kv('a')] });
      const plain = await call('dude:store:reset:preview', own, 'clear-data');
      expect(await call('dude:store:reset:apply', own, { kind: 'clear-data', token: plain.token, deleteFromHub: true })).toEqual({ ok: false, error: 'invalid-token' });
      expect(api.syncClear).not.toHaveBeenCalled();
      expect(await counts()).toBe(1);
      expect(own.reloadCount).toBe(0);
    });

    it('applies with its own token: the Hub clear runs with the previewed confirmation, then the device wipes', async () => {
      await host.call('kv.commit', { mutations: [kv('a')] });
      const preview = await call('dude:store:reset:preview', own, 'clear-data', { deleteFromHub: true });
      expect(await call('dude:store:reset:apply', own, { kind: 'clear-data', token: preview.token, deleteFromHub: true })).toEqual({ ok: true, hubDeleted: 5 });
      expect(api.syncClear).toHaveBeenCalledExactlyOnceWith('owner-token', 'conf-9');
      expect(await counts()).toBe(0);
      expect(own.reloadCount).toBe(1);
    });

    it('a Hub failure leaves the device untouched and reports why', async () => {
      await host.call('kv.commit', { mutations: [kv('a')] });
      const preview = await call('dude:store:reset:preview', own, 'clear-data', { deleteFromHub: true });
      api.syncClear.mockRejectedValueOnce(new Error('down'));
      expect(await call('dude:store:reset:apply', own, { kind: 'clear-data', token: preview.token, deleteFromHub: true })).toMatchObject({ ok: false, error: 'failed' });
      expect(await counts()).toBe(1);
      expect(own.reloadCount).toBe(0);
    });

    it('reset-device cannot be combined with deleteFromHub', async () => {
      expect(await call('dude:store:reset:preview', own, 'reset-device', { deleteFromHub: true })).toEqual({ ok: false, error: 'failed' });
    });
  });

  it('openFolder ignores any renderer-supplied path', async () => {
    expect(await call('dude:store:recovery:openFolder', own, 'C:/Windows/System32', { path: 'C:/' })).toEqual({ ok: true });
    expect(openPath).toHaveBeenCalledTimes(1);
    expect(openPath).toHaveBeenCalledWith('C:/userData/device-store');
  });

  it('quarantine is not offered while the store is healthy', async () => {
    expect(await call('dude:store:recovery:quarantinePreview', own)).toEqual({ ok: false, error: 'not-needed' });
    expect(await call('dude:store:recovery:quarantineApply', own, 'x')).toMatchObject({ ok: false });
  });

  describe('quarantine and reset of an unusable store', () => {
    let dir: string;
    let restarted: number;
    // An unusable store: the connected agent serves `store.quarantine` itself (see rpc/server.spec.ts); here it is emulated.
    const quarantineCalls: string[] = [];
    const unusable = (): DeviceStoreHost => ({
      ...host,
      status: () => 'corrupt',
      shutdown: async () => undefined,
      call: (async (method: string) => {
        if (method !== 'store.quarantine') throw new Error(`unexpected ${method}`);
        quarantineCalls.push(method);
        return { ok: true, path: quarantineStore(dir, new Date('2026-01-02T03:04:05.678Z')) };
      }) as DeviceStoreHost['call'],
    });
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'dude-quarantine-'));
      writeFileSync(join(dir, 'dude-device.db'), 'garbage');
      restarted = 0;
      quarantineCalls.length = 0;
      mock.handlers.clear();
      const broken = unusable();
      registerStoreResetHandlers(window, { host: () => broken, restartHost: async () => { restarted++; return broken; }, storeDir: () => dir, openPath, now: () => new Date('2026-01-02T03:04:05.678Z') });
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('preview moves nothing; apply needs its token, moves the files once, restarts and reloads', async () => {
      const preview = await call('dude:store:recovery:quarantinePreview', own);
      expect(preview).toMatchObject({ ok: true, files: [{ name: 'dude-device.db', sizeBytes: 7 }] });
      expect(existsSync(join(dir, 'dude-device.db'))).toBe(true);
      expect(await call('dude:store:recovery:quarantineApply', own, undefined)).toEqual({ ok: false, error: 'invalid-token' });
      expect(await call('dude:store:recovery:quarantineApply', foreign, preview.token)).toEqual({ ok: false, error: 'forbidden' });
      expect(existsSync(join(dir, 'dude-device.db'))).toBe(true);
      expect(await call('dude:store:recovery:quarantineApply', own, preview.token)).toEqual({ ok: true });
      expect(existsSync(join(dir, 'dude-device.db'))).toBe(false);
      expect(existsSync(join(dir, 'quarantine', '2026-01-02T03-04-05-678Z', 'dude-device.db'))).toBe(true);
      expect(quarantineCalls).toEqual(['store.quarantine']);
      expect(restarted).toBe(1);
      expect(own.reloadCount).toBe(1);
      expect(await call('dude:store:recovery:quarantineApply', own, preview.token)).toMatchObject({ ok: false });
    });

    it('files that changed since the preview are stale', async () => {
      const preview = await call('dude:store:recovery:quarantinePreview', own);
      writeFileSync(join(dir, 'dude-device.db'), 'garbage-and-more');
      expect(await call('dude:store:recovery:quarantineApply', own, preview.token)).toEqual({ ok: false, error: 'stale-preview' });
      expect(existsSync(join(dir, 'dude-device.db'))).toBe(true);
      expect(restarted).toBe(0);
    });
  });
});

