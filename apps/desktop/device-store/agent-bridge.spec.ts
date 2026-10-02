const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }));
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/ud', isPackaged: false },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
}));

import type { BackgroundAgentStatus } from '@dude/contracts';
import { registerAgentHandlers } from './agent-bridge';
import type { AgentBackground } from './agent-background';

const own = { id: 'own' };
const foreign = { id: 'foreign' };
const window = { webContents: own } as any;

const STATUS: BackgroundAgentStatus = { running: true, stoppedByUser: false, autostart: 'enabled', mechanism: 'run-key' };

function fakeBackground() {
  const calls: string[] = [];
  const background: AgentBackground = {
    init: async () => undefined,
    keepAgentRunning: () => true,
    status: async () => { calls.push('status'); return STATUS; },
    setAutostart: async (enabled) => { calls.push(`setAutostart:${enabled}`); return { ok: true, status: STATUS }; },
    stop: async () => { calls.push('stop'); return { ok: true, status: { ...STATUS, running: false, stoppedByUser: true } }; },
    start: async () => { calls.push('start'); return { ok: true, status: STATUS }; },
  };
  return { background, calls };
}

const CHANNELS: Array<[string, unknown[]]> = [
  ['dude:device:agentStatus', []],
  ['dude:device:setAgentAutostart', [true]],
  ['dude:device:stopAgent', []],
  ['dude:device:startAgent', []],
];

describe('background agent bridge', () => {
  let ctx: ReturnType<typeof fakeBackground>;
  beforeEach(() => {
    mock.handlers.clear();
    ctx = fakeBackground();
    registerAgentHandlers(window, () => ctx.background);
  });

  it.each(CHANNELS)('%s rejects a foreign sender without touching the agent', async (channel, args) => {
    const result = await Promise.resolve(mock.handlers.get(channel)!({ sender: foreign }, ...args)).catch((e: Error) => ({ ok: false, error: e.message }));
    expect(result).toMatchObject({ ok: false, error: 'forbidden' });
    expect(ctx.calls).toEqual([]);
  });

  it('forwards the four actions from this window', async () => {
    const call = (channel: string, ...args: unknown[]) => mock.handlers.get(channel)!({ sender: own }, ...args);
    expect(await call('dude:device:agentStatus')).toEqual(STATUS);
    expect(await call('dude:device:setAgentAutostart', false)).toMatchObject({ ok: true });
    expect(await call('dude:device:stopAgent')).toMatchObject({ ok: true, status: { stoppedByUser: true } });
    expect(await call('dude:device:startAgent')).toMatchObject({ ok: true });
    expect(ctx.calls).toEqual(['status', 'setAutostart:false', 'stop', 'start']);
  });

  it('accepts only a boolean for the autostart toggle', async () => {
    const call = (value: unknown) => mock.handlers.get('dude:device:setAgentAutostart')!({ sender: own }, value);
    for (const bad of ['true', 1, null, undefined, { enabled: true }]) expect(await call(bad)).toMatchObject({ ok: false });
    expect(ctx.calls).toEqual([]);
  });
});
