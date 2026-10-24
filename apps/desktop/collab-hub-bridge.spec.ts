const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }));
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/ud', isPackaged: false },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
}));

import type { AgentEvent } from '@dude/contracts';
import { COLLAB_MAX_CONTROL_BYTES, COLLAB_MAX_FRAME_BYTES } from '@dude/contracts/hub';
import { DeviceStoreError } from './device-store/agent-host';
import type { DeviceStoreHost } from './device-store/agent-host';
import { registerCollabHubHandlers } from './collab-hub-bridge';

const sent: Array<{ channel: string; payload: unknown }> = [];
const webContentsListeners = new Map<string, () => void>();
const own = {
  id: 'own', isDestroyed: () => false,
  send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
  on: (event: string, listener: () => void) => webContentsListeners.set(event, listener),
};
const foreign = { id: 'foreign' };
const window = { webContents: own, isDestroyed: () => false } as any;

const CHANNELS = ['dude:collab-hub:open', 'dude:collab-hub:send', 'dude:collab-hub:close'];
type Handler = (event: { sender: unknown }, ...args: unknown[]) => Promise<any>;
const call = (channel: string, sender: unknown, ...args: unknown[]) => (mock.handlers.get(channel) as Handler)({ sender }, ...args);
const b64 = (length: number): string => Buffer.alloc(length, 1).toString('base64');
const subscribe = { kind: 'control', text: JSON.stringify({ type: 'subscribe', channel: 1, doc: 'room:r1' }) };

function fakeHost(answer: (method: string) => unknown = () => ({ ok: true })) {
  const calls: Array<{ method: string; params: unknown }> = [];
  let eventListener: ((event: AgentEvent) => void) | null = null;
  let healthListener: (() => void) | null = null;
  const state = { running: true };
  const host = {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      const out = answer(method);
      if (out instanceof Error) throw out;
      return out;
    },
    onEvent: (listener: (event: AgentEvent) => void) => { eventListener = listener; return () => undefined; },
    onHealth: (listener: () => void) => { healthListener = listener; return () => undefined; },
    agentRunning: () => state.running,
  } as unknown as DeviceStoreHost;
  return {
    host, calls, state,
    emit: (event: unknown) => eventListener?.(event as AgentEvent),
    health: () => healthListener?.(),
  };
}

describe('collaboration relay bridge', () => {
  let ctx: ReturnType<typeof fakeHost>;
  const register = (next = fakeHost()): void => {
    mock.handlers.clear();
    sent.length = 0;
    ctx = next;
    registerCollabHubHandlers(window, () => ctx.host);
  };
  beforeEach(() => register());

  it('registers exactly the three invoke channels', () => {
    expect([...mock.handlers.keys()].sort()).toEqual([...CHANNELS].sort());
  });

  it.each(CHANNELS)('rejects a foreign sender before the agent (%s)', async (channel) => {
    expect(await call(channel, foreign, subscribe)).toEqual({ ok: false, error: { code: 'forbidden', message: 'forbidden' } });
    expect(await call(channel, foreign)).toEqual({ ok: false, error: { code: 'forbidden', message: 'forbidden' } });
    expect(ctx.calls).toEqual([]);
  });

  it('rejects the wrong number of arguments', async () => {
    for (const channel of ['dude:collab-hub:open', 'dude:collab-hub:close']) expect(await call(channel, own, 1)).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    for (const args of [[], [subscribe, subscribe], [subscribe, 1]]) expect(await call('dude:collab-hub:send', own, ...args)).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    expect(ctx.calls).toEqual([]);
  });

  it('forwards open and close to the agent', async () => {
    expect(await call('dude:collab-hub:open', own)).toEqual({ ok: true, result: { ok: true } });
    expect(await call('dude:collab-hub:close', own)).toEqual({ ok: true, result: { ok: true } });
    expect(ctx.calls).toEqual([{ method: 'collab.open', params: {} }, { method: 'collab.close', params: {} }]);
  });

  it('passes a gate refusal through unchanged', async () => {
    register(fakeHost(() => ({ ok: false, reason: 'needs-reconcile', message: 'reconcile' })));
    expect(await call('dude:collab-hub:open', own)).toEqual({ ok: true, result: { ok: false, reason: 'needs-reconcile', message: 'reconcile' } });
  });

  it('forwards a valid control frame and a valid binary frame as clean copies', async () => {
    expect(await call('dude:collab-hub:send', own, { ...subscribe, extra: 1 })).toEqual({ ok: true, result: { ok: true } });
    expect(await call('dude:collab-hub:send', own, { kind: 'binary', base64: 'AQID' })).toEqual({ ok: true, result: { ok: true } });
    expect(ctx.calls).toEqual([{ method: 'collab.send', params: subscribe }, { method: 'collab.send', params: { kind: 'binary', base64: 'AQID' } }]);
  });

  it.each([
    [null], [undefined], ['frame'], [{}], [{ kind: 'control' }], [{ kind: 'control', text: '' }], [{ kind: 'binary', base64: '' }], [{ kind: 'binary', base64: 'not base64' }],
    [{ kind: 'control', text: 'a'.repeat(COLLAB_MAX_CONTROL_BYTES + 1) }], [{ kind: 'binary', base64: b64(COLLAB_MAX_FRAME_BYTES + 1) }], [{ kind: 'other', text: 'x' }],
  ])('rejects an invalid or oversized frame before the agent (%j)', async (frame) => {
    expect(await call('dude:collab-hub:send', own, frame)).toEqual({ ok: false, error: { code: 'bad-request', message: 'Invalid request.' } });
    expect(ctx.calls).toEqual([]);
  });

  it('accepts a frame exactly at the caps', async () => {
    expect(await call('dude:collab-hub:send', own, { kind: 'control', text: 'a'.repeat(COLLAB_MAX_CONTROL_BYTES) })).toMatchObject({ ok: true });
    expect(await call('dude:collab-hub:send', own, { kind: 'binary', base64: b64(COLLAB_MAX_FRAME_BYTES) })).toMatchObject({ ok: true });
  });

  it('maps agent failures to an error result without a stack, and an absent agent to unavailable', async () => {
    register(fakeHost(() => new DeviceStoreError('collab-not-open', 'not yours')));
    expect(await call('dude:collab-hub:send', own, subscribe)).toEqual({ ok: false, error: { code: 'collab-not-open', message: 'not yours' } });
    register(fakeHost(() => new Error('boom with /secret/path')));
    expect(await call('dude:collab-hub:open', own)).toEqual({ ok: false, error: { code: 'internal', message: 'The collaboration request failed.' } });
    mock.handlers.clear();
    registerCollabHubHandlers(window, () => null);
    expect(await call('dude:collab-hub:open', own)).toEqual({ ok: false, error: { code: 'unavailable', message: 'The device agent is not running.' } });
  });

  describe('pushes', () => {
    it('relays Hub frames and state to the window only, as clean copies', () => {
      ctx.emit({ type: 'event', event: 'collab.frame', kind: 'control', text: '{"type":"heartbeat"}' });
      ctx.emit({ type: 'event', event: 'collab.frame', kind: 'binary', base64: 'AQID' });
      ctx.emit({ type: 'event', event: 'collab.state', state: 'closed', code: 4008, reason: 'incompatible', willRetry: false });
      ctx.emit({ type: 'event', event: 'collab.state', state: 'open' });
      ctx.emit({ type: 'event', event: 'hub.status', status: {} });
      expect(sent).toEqual([
        { channel: 'dude:collab-hub:frame', payload: { kind: 'control', text: '{"type":"heartbeat"}' } },
        { channel: 'dude:collab-hub:frame', payload: { kind: 'binary', base64: 'AQID' } },
        { channel: 'dude:collab-hub:state', payload: { state: 'closed', code: 4008, reason: 'incompatible', willRetry: false } },
        { channel: 'dude:collab-hub:state', payload: { state: 'open' } },
      ]);
    });

    it('does not push to a destroyed window', () => {
      const destroyed = { ...window, isDestroyed: () => true };
      mock.handlers.clear();
      sent.length = 0;
      registerCollabHubHandlers(destroyed, () => ctx.host);
      ctx.emit({ type: 'event', event: 'collab.state', state: 'open' });
      expect(sent).toEqual([]);
    });
  });

  describe('a lost agent', () => {
    it('tells the renderer when the agent goes away while it holds the socket', async () => {
      await call('dude:collab-hub:open', own);
      ctx.state.running = false;
      ctx.health();
      expect(sent).toEqual([{ channel: 'dude:collab-hub:state', payload: { state: 'closed', reason: 'agent-unavailable', willRetry: false } }]);
      ctx.health();
      expect(sent).toHaveLength(1);
    });

    it('says nothing when nothing was held, the open was refused, or the agent is still running', async () => {
      ctx.state.running = false;
      ctx.health();
      expect(sent).toEqual([]);
      register(fakeHost(() => ({ ok: false, reason: 'hub-offline', message: 'x' })));
      await call('dude:collab-hub:open', own);
      ctx.state.running = false;
      ctx.health();
      expect(sent).toEqual([]);
      register();
      await call('dude:collab-hub:open', own);
      ctx.health();
      expect(sent).toEqual([]);
    });

    it('does not report a lost agent after the hold ended (closed by the renderer, or by the agent for good)', async () => {
      await call('dude:collab-hub:open', own);
      await call('dude:collab-hub:close', own);
      ctx.state.running = false;
      ctx.health();
      expect(sent).toEqual([]);
      register();
      await call('dude:collab-hub:open', own);
      ctx.emit({ type: 'event', event: 'collab.state', state: 'closed', reason: 'displaced', willRetry: false });
      sent.length = 0;
      ctx.state.running = false;
      ctx.health();
      expect(sent).toEqual([]);
    });

    it('keeps the hold while the agent reconnects by itself', async () => {
      await call('dude:collab-hub:open', own);
      ctx.emit({ type: 'event', event: 'collab.state', state: 'closed', reason: 'dropped', willRetry: true });
      sent.length = 0;
      ctx.state.running = false;
      ctx.health();
      expect(sent).toHaveLength(1);
    });
  });

  it('lets the agent close the socket when the renderer process dies', async () => {
    await call('dude:collab-hub:open', own);
    webContentsListeners.get('render-process-gone')?.();
    await Promise.resolve();
    expect(ctx.calls.map((c) => c.method)).toEqual(['collab.open', 'collab.close']);
    webContentsListeners.get('render-process-gone')?.();
    await Promise.resolve();
    expect(ctx.calls).toHaveLength(2);
  });
});
