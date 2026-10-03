import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }));
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/ud', isPackaged: false },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
}));

import type { AgentEvent } from '@dude/contracts';
import type { DesktopSyncBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { registerSyncHandlers } from './sync-bridge';

const own = { id: 'own', send: vi.fn(), isDestroyed: () => false };
const foreign = { id: 'foreign' };
const window = { webContents: own, isDestroyed: () => false } as any;

const TOKEN = 'abcDEF_-123';
const OP = '0190aaaa-0000-7000-8000-000000000001';
const DIGEST = 'sha256:abc123';

type Handler = (event: { sender: unknown }, ...args: unknown[]) => Promise<any>;
const call = (channel: string, sender: unknown, ...args: unknown[]) => (mock.handlers.get(channel) as Handler)({ sender }, ...args);

// Every bridge method with a valid argument list and the agent RPC it maps to; tsc fails when the type gains or loses a method.
const VALID: Record<Exclude<keyof DesktopSyncBridge, 'onStatusChanged' | 'onApplied'>, { channel: string; method: string; args: unknown[]; params: unknown; invalid: unknown[][] }> = {
  status: { channel: 'dude:sync:status', method: 'sync.status', args: [], params: {}, invalid: [[1]] },
  setCategories: {
    channel: 'dude:sync:setCategories', method: 'sync.setCategories', args: [{ settings: true, pipelines: false }], params: { categories: { settings: true, pipelines: false } },
    invalid: [[], [{}], [{ nope: true }], [{ settings: 'yes' }], [{ settings: true }, 1], ['settings'], [[true]], [null]],
  },
  setPaused: { channel: 'dude:sync:setPaused', method: 'sync.setPaused', args: [true], params: { paused: true }, invalid: [[], ['true'], [1], [true, true]] },
  syncNow: { channel: 'dude:sync:now', method: 'sync.now', args: [], params: {}, invalid: [[1]] },
  listConflicts: { channel: 'dude:sync:conflicts:list', method: 'sync.conflicts.list', args: [], params: {}, invalid: [[1]] },
  resolveConflict: {
    channel: 'dude:sync:conflicts:resolve', method: 'sync.conflicts.resolve', args: [7, 'both'], params: { id: 7, choice: 'both' },
    invalid: [[], [7], ['7', 'hub'], [0, 'hub'], [1.5, 'hub'], [7, 'theirs'], [7, 'hub', 1], [Number.MAX_SAFE_INTEGER + 1, 'hub']],
  },
  listQuarantined: { channel: 'dude:sync:quarantine:list', method: 'sync.quarantine.list', args: [], params: {}, invalid: [[1]] },
  retryQuarantined: {
    channel: 'dude:sync:quarantine:retry', method: 'sync.quarantine.retry', args: [[OP]], params: { opIds: [OP] },
    invalid: [['x'], [[]], [[1]], [['a b']], [['a'.repeat(129)]], [new Array(1001).fill(OP)], [[OP], 1]],
  },
  discardQuarantinedPreview: { channel: 'dude:sync:quarantine:discardPreview', method: 'sync.quarantine.discardPreview', args: [OP], params: { opId: OP }, invalid: [[], [''], ['../x'], [1], [OP, OP]] },
  discardQuarantined: {
    channel: 'dude:sync:quarantine:discard', method: 'sync.quarantine.discard', args: [OP, TOKEN], params: { opId: OP, confirmToken: TOKEN },
    invalid: [[OP], [OP, 'a b'], [OP, 'a'.repeat(129)], ['a b', TOKEN], [OP, TOKEN, 1]],
  },
  exportQuarantined: { channel: 'dude:sync:quarantine:export', method: 'sync.quarantine.export', args: [], params: {}, invalid: [[1]] },
  firstSyncPreview: { channel: 'dude:sync:firstSync:preview', method: 'sync.firstSync.preview', args: [], params: {}, invalid: [[1]] },
  firstSyncApply: {
    channel: 'dude:sync:firstSync:apply', method: 'sync.firstSync.apply', args: [{ settings: 'merge', home: 'use-hub' }, DIGEST, TOKEN],
    params: { choices: { settings: 'merge', home: 'use-hub' }, digest: DIGEST, confirmToken: TOKEN },
    invalid: [[], [{ settings: 'merge' }], [{}, DIGEST], [{ nope: 'merge' }, DIGEST], [{ settings: 'replace' }, DIGEST], [{ settings: 'merge' }, ''],
      [{ settings: 'merge' }, 'bad digest'], [{ settings: 'merge' }, DIGEST, 'a b'], [{ settings: 'merge' }, DIGEST, TOKEN, 1], ['merge', DIGEST]],
  },
  standalonePreview: { channel: 'dude:sync:standalone:preview', method: 'sync.standalone.preview', args: [], params: {}, invalid: [[1]] },
  standaloneApply: {
    channel: 'dude:sync:standalone:apply', method: 'sync.standalone.apply', args: [TOKEN, DIGEST], params: { confirmToken: TOKEN, digest: DIGEST },
    invalid: [[], [TOKEN], ['a b', DIGEST], [TOKEN, ''], [TOKEN, DIGEST, 1], [1, 2]],
  },
};

function fakeHost(handler: (method: string, params: unknown) => unknown = () => ({ ok: true })) {
  const calls: Array<{ method: string; params: unknown }> = [];
  const listeners = new Set<(e: AgentEvent) => void>();
  const host = {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      const out = handler(method, params);
      if (out instanceof Error) throw out;
      return out;
    },
    onEvent: (l: (e: AgentEvent) => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  } as unknown as DeviceStoreHost;
  return { host, calls, push: (e: AgentEvent) => listeners.forEach((l) => l(e)) };
}

describe('sync bridge', () => {
  let ctx: ReturnType<typeof fakeHost>;
  const setup = (handler?: (method: string, params: unknown) => unknown) => {
    mock.handlers.clear();
    own.send.mockClear();
    ctx = fakeHost(handler);
    registerSyncHandlers(window, () => ctx.host);
  };
  beforeEach(() => setup());

  it('registers exactly one channel per bridge method', () => {
    expect([...mock.handlers.keys()].sort()).toEqual(Object.values(VALID).map((v) => v.channel).sort());
  });

  it.each(Object.entries(VALID))('%s rejects a foreign sender before the agent', async (_name, v) => {
    expect(await call(v.channel, foreign, ...v.args)).toEqual({ ok: false, error: { code: 'forbidden', message: 'forbidden' } });
    expect(ctx.calls).toEqual([]);
  });

  it.each(Object.entries(VALID))('%s rejects invalid payloads before the agent', async (_name, v) => {
    for (const args of v.invalid) {
      expect(await call(v.channel, own, ...args), JSON.stringify(args)).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    }
    expect(ctx.calls).toEqual([]);
  });

  it.each(Object.entries(VALID))('%s maps to its agent RPC with the validated params', async (_name, v) => {
    setup(() => ({ marker: 1 }));
    expect(await call(v.channel, own, ...v.args)).toEqual({ ok: true, result: { marker: 1 } });
    expect(ctx.calls).toEqual([{ method: v.method, params: v.params }]);
  });

  it('accepts omitted optionals (undefined trailing arguments)', async () => {
    expect(await call('dude:sync:quarantine:retry', own, undefined)).toMatchObject({ ok: true });
    expect(ctx.calls[0]).toEqual({ method: 'sync.quarantine.retry', params: {} });
    expect(await call('dude:sync:firstSync:apply', own, { settings: 'keep-local' }, DIGEST, undefined)).toMatchObject({ ok: true });
    expect(ctx.calls[1]).toEqual({ method: 'sync.firstSync.apply', params: { choices: { settings: 'keep-local' }, digest: DIGEST } });
  });

  it('maps agent errors without stack traces and hides unknown failures', async () => {
    setup(() => new DeviceStoreError('hub-unreachable', 'The Hub is not reachable.'));
    expect(await call('dude:sync:now', own)).toEqual({ ok: false, error: { code: 'hub-unreachable', message: 'The Hub is not reachable.' } });
    setup(() => new TypeError('boom at C:\\secret\\file.ts:12'));
    const result = await call('dude:sync:now', own);
    expect(result).toEqual({ ok: false, error: { code: 'internal', message: 'The sync request failed.' } });
    expect(JSON.stringify(result)).not.toMatch(/secret|boom|\.ts/);
  });

  it('reports unavailable when no agent host exists', async () => {
    mock.handlers.clear();
    registerSyncHandlers(window, () => null);
    expect(await call('dude:sync:status', own)).toMatchObject({ ok: false, error: { code: 'unavailable' } });
  });

  it('returns user content and the confirm token verbatim', async () => {
    setup(() => ({ asOfRevision: 1, confirmToken: 'c', categories: [{ sameIdDifferent: [{ name: 'my token notes' }] }], token: 'user-note' }));
    const result = await call('dude:sync:firstSync:preview', own);
    expect(result.result.confirmToken).toBe('c');
    expect(result.result.token).toBe('user-note');
  });

  it('pushes sync.status and sync.applied to this window and ignores hub.status and unknown frames', () => {
    const status = { phase: 'idle', lastSyncAt: null, cursor: 3 } as any;
    const changes = [{ entityType: 'pipeline', entityId: 'p1', deleted: false, payload: { name: 'mine' } }] as any;
    ctx.push({ type: 'event', event: 'sync.status', status });
    ctx.push({ type: 'event', event: 'sync.applied', changes });
    ctx.push({ type: 'event', event: 'hub.status', status: { state: 'online' } as any });
    ctx.push({ type: 'event', event: 'other' } as any);
    expect(own.send.mock.calls).toEqual([['dude:sync:statusChanged', status], ['dude:sync:applied', changes]]);
  });

  it('never logs payloads', () => {
    expect(readFileSync(resolve(__dirname, 'sync-bridge.ts'), 'utf-8')).not.toMatch(/console\./);
  });
});

describe('preload sync surface', () => {
  const preload = readFileSync(resolve(__dirname, '..', 'preload.ts'), 'utf-8');
  const block = preload.slice(preload.indexOf('  sync: {'), preload.indexOf('  appearance: {'));

  it('exposes exactly the DesktopSyncBridge methods, each on its own channel, with no generic invoke', () => {
    const keys = [...block.matchAll(/^    (\w+): /gm)].map((m) => m[1]);
    expect(keys.sort()).toEqual([...Object.keys(VALID), 'onStatusChanged', 'onApplied'].sort());
    const channels = [...block.matchAll(/ipcRenderer\.invoke\('(dude:sync:[\w:]+)'/g)].map((m) => m[1]);
    expect(channels.sort()).toEqual(Object.values(VALID).map((v) => v.channel).sort());
    expect(block).toMatch(/ipcRenderer\.on\('dude:sync:statusChanged'/);
    expect(block).toMatch(/ipcRenderer\.on\('dude:sync:applied'/);
    expect(block).not.toMatch(/invoke:\s|ipcRenderer\.invoke\([a-z]/);
  });
});
