const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  listeners: new Map<string, Array<(...args: any[]) => unknown>>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler),
    on: (channel: string, handler: (...args: any[]) => unknown) => { mock.listeners.set(channel, [...(mock.listeners.get(channel) ?? []), handler]); },
    removeListener: (channel: string, handler: (...args: any[]) => unknown) => { mock.listeners.set(channel, (mock.listeners.get(channel) ?? []).filter((h) => h !== handler)); },
  },
}));

import type { DeviceStoreHost } from './agent-host';
import { registerDeviceStoreHandlers, requestRendererFlush } from './store-bridge';

const own = { id: 'own' };
const foreign = { id: 'foreign' };
const sentToRenderer: Array<[string, unknown]> = [];
const window = { webContents: Object.assign(own, { send: (c: string, p: unknown) => sentToRenderer.push([c, p]), isDestroyed: () => false }), isDestroyed: () => false } as any;

function fakeHost() {
  const calls: Array<[string, unknown]> = [];
  const healthListeners: Array<(h: any) => void> = [];
  const host: DeviceStoreHost = {
    call: async (method: string, params: unknown) => {
      calls.push([method, params]);
      if (method === 'kv.commit') return { count: (params as any).mutations.length } as never;
      if (method === 'store.hydrate') return { status: 'ready', device: { displayName: 'D' }, kv: [], records: [] } as never;
      return { ok: true, localRevision: 1, count: 1, backpressure: false, displayName: 'Desk' } as never;
    },
    status: () => 'ready',
    health: () => null,
    onHealth: (l) => { healthListeners.push(l); return () => undefined; },
    shutdown: async () => undefined,
  };
  return { host, calls, healthListeners };
}

const INVOKE_CHANNELS: Array<[string, unknown[]]> = [
  ['dude:store:hydrate', []],
  ['dude:store:kv:commit', [[{ namespace: 'a', key: 'b', value: 1, policy: 'local' }]]],
  ['dude:store:entity:commit', [{ entityType: 'favorite', entityId: 'x', op: 'upsert', payload: {} }]],
  ['dude:store:entity:importMany', [[{ entityType: 'favorite', entityId: 'x', op: 'upsert', payload: {} }]]],
  ['dude:store:status', []],
  ['dude:device:get', []],
  ['dude:device:rename', ['Desk']],
];

describe('device store bridge', () => {
  let ctx: ReturnType<typeof fakeHost>;
  beforeEach(() => {
    mock.handlers.clear();
    mock.listeners.clear();
    sentToRenderer.length = 0;
    ctx = fakeHost();
    registerDeviceStoreHandlers(window, () => ctx.host);
  });

  it.each(INVOKE_CHANNELS)('%s rejects a foreign sender without touching the host', async (channel, args) => {
    const handler = mock.handlers.get(channel)!;
    const result = await Promise.resolve(handler({ sender: foreign }, ...args)).catch((e: Error) => ({ ok: false, error: e.message }));
    expect(result).toMatchObject({ ok: false, error: 'forbidden' });
    expect(ctx.calls).toEqual([]);
  });

  it('the one-way commit ignores a foreign sender', () => {
    mock.listeners.get('dude:store:kv:commitNoWait')![0]({ sender: foreign }, [{ namespace: 'a', key: 'b', value: 1, policy: 'local' }]);
    expect(ctx.calls).toEqual([]);
  });

  it('forwards a valid kv commit and the one-way variant', async () => {
    const mutations = [{ namespace: 'base64', key: 'mode', value: 'decode', policy: 'local' }];
    expect(await mock.handlers.get('dude:store:kv:commit')!({ sender: own }, mutations)).toEqual({ ok: true, count: 1 });
    mock.listeners.get('dude:store:kv:commitNoWait')![0]({ sender: own }, mutations);
    expect(ctx.calls).toEqual([['kv.commit', { mutations }], ['kv.commit', { mutations }]]);
  });

  it('rejects invalid payloads before they reach the host', async () => {
    const bad = [{ namespace: '../x', key: 'b', value: 1, policy: 'local' }];
    expect(await mock.handlers.get('dude:store:kv:commit')!({ sender: own }, bad)).toMatchObject({ ok: false });
    expect(await mock.handlers.get('dude:store:entity:commit')!({ sender: own }, { entityType: 'bogus', entityId: 'x', op: 'upsert' })).toMatchObject({ ok: false });
    expect(await mock.handlers.get('dude:store:entity:importMany')!({ sender: own }, [
      { entityType: 'favorite', entityId: 'a', op: 'upsert' }, { entityType: 'pipeline', entityId: 'b', op: 'upsert' },
    ])).toMatchObject({ ok: false });
    expect(await mock.handlers.get('dude:device:rename')!({ sender: own }, '')).toMatchObject({ ok: false });
    mock.listeners.get('dude:store:kv:commitNoWait')![0]({ sender: own }, bad);
    expect(ctx.calls).toEqual([]);
  });

  it('commits entities and renames the device through the host', async () => {
    expect(await mock.handlers.get('dude:store:entity:commit')!({ sender: own }, { entityType: 'favorite', entityId: 'x', op: 'upsert', payload: { a: 1 } })).toMatchObject({ ok: true });
    expect(await mock.handlers.get('dude:device:rename')!({ sender: own }, ' Desk ')).toMatchObject({ ok: true, displayName: 'Desk' });
    expect(ctx.calls.map(([m]) => m)).toEqual(['entity.commit', 'device.rename']);
    expect(ctx.calls[1][1]).toEqual({ displayName: 'Desk' });
  });

  it('hydrates degraded when the host is missing or not ready', async () => {
    mock.handlers.clear();
    registerDeviceStoreHandlers(window, () => null);
    expect(await mock.handlers.get('dude:store:hydrate')!({ sender: own })).toEqual({ status: 'unavailable', device: null, kv: [], records: [] });
    mock.handlers.clear();
    registerDeviceStoreHandlers(window, () => ({ ...ctx.host, status: () => 'degraded' }));
    expect(await mock.handlers.get('dude:store:hydrate')!({ sender: own })).toMatchObject({ status: 'degraded', device: null, kv: [] });
  });

  it('pushes health changes to the renderer', () => {
    ctx.healthListeners[0]({ status: 'degraded' });
    expect(sentToRenderer).toEqual([['dude:store:health', { status: 'degraded' }]]);
  });

  describe('flush handshake', () => {
    it('resolves on a matching reply from the window, ignoring foreign and mismatched replies', async () => {
      const promise = requestRendererFlush(window, 5000);
      const [channel, id] = sentToRenderer[0] as [string, number];
      expect(channel).toBe('dude:store:flush');
      let settled = false;
      void promise.then(() => { settled = true; });
      const listener = mock.listeners.get('dude:store:flushed')![0];
      listener({ sender: foreign }, id);
      listener({ sender: own }, id + 100);
      await Promise.resolve();
      expect(settled).toBe(false);
      listener({ sender: own }, id);
      await promise;
      expect(mock.listeners.get('dude:store:flushed')).toEqual([]);
    });

    it('resolves on timeout', async () => {
      vi.useFakeTimers();
      try {
        const promise = requestRendererFlush(window, 1500);
        await vi.advanceTimersByTimeAsync(1500);
        await promise;
      } finally { vi.useRealTimers(); }
    });
  });
});
