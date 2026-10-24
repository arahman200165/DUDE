const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }));
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/ud', isPackaged: false },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
}));

import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { parseActivity, registerPresenceHandlers } from './presence-bridge';

const own = { id: 'own' };
const foreign = { id: 'foreign' };
const window = { webContents: own } as any;
const CHANNEL = 'dude:presence:setActivity';

type Handler = (event: { sender: unknown }, ...args: unknown[]) => Promise<any>;
const call = (sender: unknown, ...args: unknown[]) => (mock.handlers.get(CHANNEL) as Handler)({ sender }, ...args);

function fakeHost(handler: () => unknown = () => ({ ok: true })) {
  const calls: Array<{ method: string; params: unknown }> = [];
  const host = {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      const out = handler();
      if (out instanceof Error) throw out;
      return out;
    },
  } as unknown as DeviceStoreHost;
  return { host, calls };
}

describe('presence bridge', () => {
  let ctx: ReturnType<typeof fakeHost>;
  beforeEach(() => {
    mock.handlers.clear();
    ctx = fakeHost();
    registerPresenceHandlers(window, () => ctx.host);
  });

  it('registers exactly the one channel', () => {
    expect([...mock.handlers.keys()]).toEqual([CHANNEL]);
  });

  it('rejects a foreign sender before the agent', async () => {
    expect(await call(foreign, null)).toEqual({ ok: false, error: { code: 'forbidden', message: 'forbidden' } });
    expect(ctx.calls).toEqual([]);
  });

  it.each([
    [[]], [[undefined]], [['tool']], [[1]], [[{}]], [[[]]], [[{ kind: 'tool' }]], [[{ id: 'base64' }]],
    [[{ kind: 'tool', id: '' }]], [[{ kind: 'tool', id: 'Base64' }]], [[{ kind: 'tool', id: '-x' }]], [[{ kind: 'tool', id: 'a'.repeat(65) }]], [[{ kind: 'tool', id: 'a/b' }]],
    [[{ kind: 'destination', id: 'base64' }]], [[{ kind: 'destination', id: 'admin' }]], [[{ kind: 'page', id: 'home' }]],
    [[{ kind: 'tool', id: 'base64', extra: 1 }]], [[{ kind: 'tool', id: 5 }]], [[null, null]], [[{ kind: 'tool', id: 'base64' }, 1]],
  ])('rejects an invalid payload before the agent (%j)', async (args) => {
    expect(await call(own, ...args)).toEqual({ ok: false, error: { code: 'bad-request', message: 'Invalid request.' } });
    expect(ctx.calls).toEqual([]);
  });

  it('forwards a tool, a destination and null to the agent', async () => {
    expect(await call(own, { kind: 'tool', id: 'base64' })).toEqual({ ok: true, result: { ok: true } });
    expect(await call(own, { kind: 'destination', id: 'settings' })).toEqual({ ok: true, result: { ok: true } });
    expect(await call(own, null)).toEqual({ ok: true, result: { ok: true } });
    expect(ctx.calls).toEqual([
      { method: 'presence.setActivity', params: { activity: { kind: 'tool', id: 'base64' } } },
      { method: 'presence.setActivity', params: { activity: { kind: 'destination', id: 'settings' } } },
      { method: 'presence.setActivity', params: { activity: null } },
    ]);
  });

  it('maps agent failures to an error result without a stack', async () => {
    ctx = fakeHost(() => new DeviceStoreError('unavailable', 'gone'));
    mock.handlers.clear();
    registerPresenceHandlers(window, () => ctx.host);
    expect(await call(own, null)).toEqual({ ok: false, error: { code: 'unavailable', message: 'gone' } });
  });

  it('reports an absent agent as unavailable', async () => {
    mock.handlers.clear();
    registerPresenceHandlers(window, () => null);
    expect(await call(own, null)).toEqual({ ok: false, error: { code: 'unavailable', message: 'The device agent is not running.' } });
  });

  it('parseActivity returns a fresh copy of only the known fields', () => {
    const input = { kind: 'tool', id: 'base64' };
    const parsed = parseActivity(input);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
  });
});
