const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }));
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/ud', isPackaged: false },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: class {},
}));

import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { registerStandbyHandlers } from './standby-bridge';

const own = { id: 'own' };
const foreign = { id: 'foreign' };
const window = { webContents: own } as any;
const CHANNELS = ['dude:standby:status', 'dude:standby:pullNow', 'dude:standby:chooseFolder'];
const STATUS = { phase: 'idle', folder: 'D:\Standby' };

type Handler = (event: { sender: unknown }, ...args: unknown[]) => Promise<any>;
const call = (channel: string, sender: unknown, ...args: unknown[]) => (mock.handlers.get(channel) as Handler)({ sender }, ...args);

function fakeHost(handler: (method: string, params: unknown) => unknown = () => STATUS) {
  const calls: Array<{ method: string; params: unknown }> = [];
  const host = {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      const out = handler(method, params);
      if (out instanceof Error) throw out;
      return out;
    },
  } as unknown as DeviceStoreHost;
  return { host, calls };
}

describe('standby bridge', () => {
  let ctx: ReturnType<typeof fakeHost>;
  let pick: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mock.handlers.clear();
    ctx = fakeHost();
    pick = vi.fn(async () => 'D:\Standby');
    registerStandbyHandlers(window, () => ctx.host, pick);
  });

  it('registers exactly the three channels', () => {
    expect([...mock.handlers.keys()].sort()).toEqual([...CHANNELS].sort());
  });

  it.each(CHANNELS)('rejects a foreign sender on %s before the agent or the dialog', async (channel) => {
    expect(await call(channel, foreign)).toEqual({ ok: false, error: { code: 'forbidden', message: 'forbidden' } });
    expect(ctx.calls).toEqual([]);
    expect(pick).not.toHaveBeenCalled();
  });

  it.each(CHANNELS)('accepts no argument on %s (the renderer never supplies a path)', async (channel) => {
    expect(await call(channel, own, 'C:\Windows')).toEqual({ ok: false, error: { code: 'bad-request', message: 'Invalid request.' } });
    expect(await call(channel, own, { folder: 'C:\Windows' })).toMatchObject({ ok: false });
    expect(ctx.calls).toEqual([]);
    expect(pick).not.toHaveBeenCalled();
  });

  it('reads the status and asks for a run now through the agent', async () => {
    expect(await call('dude:standby:status', own)).toEqual({ ok: true, result: STATUS });
    expect(await call('dude:standby:pullNow', own)).toEqual({ ok: true, result: STATUS });
    expect(ctx.calls).toEqual([{ method: 'standby.status', params: {} }, { method: 'standby.pullNow', params: {} }]);
  });

  it('hands the agent the folder the native dialog returned, nothing else', async () => {
    expect(await call('dude:standby:chooseFolder', own)).toEqual({ ok: true, result: { canceled: false, status: STATUS } });
    expect(pick).toHaveBeenCalledExactlyOnceWith(window);
    expect(ctx.calls).toEqual([{ method: 'standby.setFolder', params: { folder: 'D:\Standby' } }]);
  });

  it('leaves the configuration alone when the dialog is cancelled', async () => {
    pick.mockResolvedValueOnce(null);
    expect(await call('dude:standby:chooseFolder', own)).toEqual({ ok: true, result: { canceled: true, status: STATUS } });
    expect(ctx.calls).toEqual([{ method: 'standby.status', params: {} }]);
  });

  it('maps agent failures to an error result without a stack, and reports an absent agent as unavailable', async () => {
    ctx = fakeHost(() => new DeviceStoreError('folder-unavailable', 'The standby folder does not exist.'));
    mock.handlers.clear();
    registerStandbyHandlers(window, () => ctx.host, pick);
    expect(await call('dude:standby:chooseFolder', own)).toEqual({ ok: false, error: { code: 'folder-unavailable', message: 'The standby folder does not exist.' } });
    mock.handlers.clear();
    registerStandbyHandlers(window, () => null, pick);
    expect(await call('dude:standby:status', own)).toEqual({ ok: false, error: { code: 'unavailable', message: 'The device agent is not running.' } });
    expect(await call('dude:standby:chooseFolder', own)).toEqual({ ok: false, error: { code: 'unavailable', message: 'The device agent is not running.' } });
  });

  it('turns an unexpected error into a generic message', async () => {
    ctx = fakeHost(() => new Error('C:\secret\path exploded'));
    mock.handlers.clear();
    registerStandbyHandlers(window, () => ctx.host, pick);
    expect(await call('dude:standby:pullNow', own)).toEqual({ ok: false, error: { code: 'internal', message: 'The standby request failed.' } });
  });
});
