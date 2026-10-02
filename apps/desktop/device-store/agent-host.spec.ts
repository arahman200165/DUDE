vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' },
  safeStorage: { isEncryptionAvailable: () => true },
}));

import { startDeviceAgent, DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { makeHarness } from './agent-host.testing';
import type { Harness } from './agent-host.testing';

const HEALTH = { status: 'ready', schemaVersion: 1, minReaderVersion: 1, sizeBytes: 0, outbox: { pending: 0, maxRows: 0, backpressure: false }, legacyImport: 'none' };
const APP_INFO = { appVersion: '1.0.0', platform: 'windows', os: '10', arch: 'x64' } as const;

function begin(h: Harness): Promise<DeviceStoreHost> {
  return startDeviceAgent({ userDataDir: 'C:\\ud', appInfo: APP_INFO, capabilities: { desktop: true }, machineGuid: 'g', transport: h.transport });
}
/** The agent accepts the connection; the host sees it a tick later. */
const ready = async (h: Harness, index = h.attempts.length - 1): Promise<void> => {
  h.attempts[index].resolve({ type: 'ready', status: 'ready', health: HEALTH });
  await vi.advanceTimersByTimeAsync(0);
};

/** A connect attempt that fails (nobody listening); the host sees it a tick later. */
const fail = async (h: Harness, index: number): Promise<void> => {
  h.attempts[index]?.reject(new Error('no-server'));
  await vi.advanceTimersByTimeAsync(0);
};

describe('agent host', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('connects with the store config, becomes ready on the agent boot payload and exposes its health', async () => {
    const h = makeHarness();
    const starting = begin(h);
    expect(h.attempts).toHaveLength(1);
    expect(h.attempts[0].config).toMatchObject({ machineGuid: 'g', appInfo: APP_INFO, capabilities: { desktop: true } });
    expect(h.attempts[0].conn.sent).toHaveLength(0);
    await ready(h);
    const host = await starting;
    expect(host.status()).toBe('ready');
    expect(host.health()).toEqual(HEALTH);
  });

  it('delivers typed hub.status event frames to listeners and ignores other frames', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await ready(h);
    const host = await starting;
    const seen: unknown[] = [];
    const off = host.onEvent!((event) => seen.push(event.status));
    const conn = h.attempts[0].conn;
    conn.deliver({ type: 'event', event: 'hub.status', status: { state: 'online' } });
    conn.deliver({ type: 'event', event: 'other', status: {} });
    conn.deliver({ type: 'event', event: 'hub.status' });
    expect(seen).toEqual([{ state: 'online' }]);
    off();
    conn.deliver({ type: 'event', event: 'hub.status', status: { state: 'offline' } });
    expect(seen).toHaveLength(1);
  });

  it('waits for the ready handshake and reports an incompatible store', async () => {
    const h = makeHarness();
    const starting = begin(h);
    h.attempts[0].resolve({ type: 'ready', status: 'incompatible', message: 'newer store' });
    const host = await starting;
    expect(host.status()).toBe('incompatible');
    expect(host.health()).toMatchObject({ status: 'incompatible', message: 'newer store' });
  });

  it('correlates responses by id, including out of order, and maps agent errors', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await ready(h);
    const host = await starting;
    const a = host.call('docs.get', { name: 'a' });
    const b = host.call('docs.get', { name: 'b' });
    const c = host.call('docs.get', { name: 'c' });
    const sent = h.attempts[0].conn.sent as Array<{ id: number; method: string; params: { name: string } }>;
    expect(sent.map((r) => r.params.name)).toEqual(['a', 'b', 'c']);
    h.attempts[0].conn.deliver({ id: sent[1].id, ok: true, result: 'B' });
    h.attempts[0].conn.deliver({ id: sent[0].id, ok: true, result: 'A' });
    h.attempts[0].conn.deliver({ id: sent[2].id, ok: false, error: { code: 'invalid-params', message: 'nope' } });
    expect(await a).toBe('A');
    expect(await b).toBe('B');
    await expect(c).rejects.toMatchObject({ code: 'invalid-params', message: 'nope' });
  });

  it('times out a call that is never answered', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await ready(h);
    const host = await starting;
    const call = host.call('docs.get', { name: 'x' }, { timeoutMs: 250 });
    const assertion = expect(call).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });

  it('rejects in-flight calls when the child exits, then restarts after 500 ms', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await ready(h);
    const host = await starting;
    const healths: string[] = [];
    host.onHealth((x) => healths.push(x.status));
    const inFlight = host.call('docs.get', { name: 'x' });
    const assertion = expect(inFlight).rejects.toMatchObject({ code: 'agent-exited' });
    h.attempts[0].conn.drop();
    await assertion;
    expect(host.status()).toBe('degraded');
    expect(healths).toEqual(['degraded']);
    await vi.advanceTimersByTimeAsync(499);
    expect(h.attempts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.attempts).toHaveLength(2);
    await ready(h);
    expect(host.status()).toBe('ready');
    expect(healths).toEqual(['degraded', 'ready']);
  });

  it('backs off 500 ms, 2 s, 8 s and then goes unavailable after more than 3 crashes in 2 minutes', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await ready(h);
    const host = await starting;
    const healths: string[] = [];
    host.onHealth((x) => healths.push(x.status));

    h.attempts[0].conn.drop();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.attempts).toHaveLength(2);
    await fail(h, 1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(h.attempts).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.attempts).toHaveLength(3);
    await fail(h, 2);
    await vi.advanceTimersByTimeAsync(7999);
    expect(h.attempts).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.attempts).toHaveLength(4);
    await fail(h, 3);
    expect(host.status()).toBe('unavailable');
    expect(healths.at(-1)).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.attempts).toHaveLength(4);

    await expect(host.call('docs.get', { name: 'x' })).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('retry restarts an unavailable host and resets the crash counter', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await ready(h);
    const host = await starting;
    h.attempts[0].conn.drop();
    await vi.advanceTimersByTimeAsync(500);
    await fail(h, 1);
    await vi.advanceTimersByTimeAsync(2000);
    await fail(h, 2);
    await vi.advanceTimersByTimeAsync(8000);
    await fail(h, 3);
    expect(host.status()).toBe('unavailable');

    const retried = host.retry();
    expect(h.attempts).toHaveLength(5);
    await ready(h);
    await retried;
    expect(host.status()).toBe('ready');
  });

  it('queues calls made while restarting and flushes them once the new child is ready', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await ready(h);
    const host = await starting;
    h.attempts[0].conn.drop();
    const queued = host.call('docs.get', { name: 'queued' });
    expect(h.attempts[0].conn.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.attempts[1].conn.sent).toHaveLength(0);
    await ready(h);
    const [request] = h.attempts[1].conn.sent as Array<{ id: number; method: string }>;
    expect(request.method).toBe('docs.get');
    h.attempts[1].conn.deliver({ id: request.id, ok: true, result: 'v' });
    expect(await queued).toBe('v');
  });

  it('rejects queued calls when the store becomes unavailable', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await ready(h);
    const host = await starting;
    h.attempts[0].conn.drop();
    const queued = host.call('docs.get', { name: 'q' }, { timeoutMs: 600_000 });
    const assertion = expect(queued).rejects.toMatchObject({ code: 'unavailable' });
    for (let i = 1; i <= 3; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
      await fail(h, i);
    }
    await assertion;
  });

  it('abandons a connection that is not ready in time, reports degraded, and closes a late arrival', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await vi.advanceTimersByTimeAsync(10_000);
    const host = await starting;
    expect(host.status()).toBe('degraded');
    h.attempts[0].resolve({ type: 'ready', status: 'ready', health: HEALTH });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.attempts[0].conn.closeCalls).toBe(1);
    expect(host.status()).toBe('degraded');
    await vi.advanceTimersByTimeAsync(500);
    expect(h.attempts).toHaveLength(2);
  });

  it('treats a failed connect like an exit: degraded, then a retry after the backoff', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await fail(h, 0);
    const host = await starting;
    expect(host.status()).toBe('degraded');
    await vi.advanceTimersByTimeAsync(499);
    expect(h.attempts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.attempts).toHaveLength(2);
    await ready(h);
    expect(host.status()).toBe('ready');
  });

  it('shuts down through store.shutdown and the connection closing', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await ready(h);
    const host = await starting;
    const done = host.shutdown();
    await vi.advanceTimersByTimeAsync(0);
    const [request] = h.attempts[0].conn.sent as Array<{ id: number; method: string }>;
    expect(request.method).toBe('store.shutdown');
    h.attempts[0].conn.deliver({ id: request.id, ok: true, result: { ok: true } });
    await vi.advanceTimersByTimeAsync(0);
    h.attempts[0].conn.drop();
    await done;
    expect(h.attempts[0].conn.closeCalls).toBe(0);
    expect(host.status()).toBe('unavailable');
    expect(h.attempts).toHaveLength(1);
    await expect(host.call('docs.get', { name: 'x' })).rejects.toBeInstanceOf(DeviceStoreError);
  });

  it('closes the connection itself if the agent does not end it within 3 s of shutdown', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await ready(h);
    const host = await starting;
    h.attempts[0].conn.ignoreClose = true;
    const done = host.shutdown();
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    expect(h.attempts[0].conn.closeCalls).toBe(1);
  });

  describe('background agent control', () => {
    async function running(h: Harness) {
      const starting = begin(h);
      await ready(h);
      return starting;
    }

    it('detach checkpoints, closes only the connection and never sends store.shutdown', async () => {
      const h = makeHarness();
      const host = await running(h);
      const conn = h.attempts[0].conn;
      conn.onPost = (m) => { const r = m as { id: number; method: string }; if (r.method === 'store.checkpoint') conn.deliver({ id: r.id, ok: true, result: { ok: true } }); };
      await host.detach();
      const methods = (conn.sent as Array<{ method: string }>).map((r) => r.method);
      expect(methods).toEqual(['store.checkpoint']);
      expect(conn.closeCalls).toBe(1);
      expect(host.status()).toBe('unavailable');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(h.attempts).toHaveLength(1);
    });

    it('detach still closes the connection when the checkpoint is never answered', async () => {
      const h = makeHarness();
      const host = await running(h);
      const detaching = host.detach();
      await vi.advanceTimersByTimeAsync(3_000);
      await detaching;
      expect(h.attempts[0].conn.closeCalls).toBe(1);
    });

    it('an intentional stop sends store.shutdown, does not respawn or spiral to unavailable-by-crash, and start recovers', async () => {
      const h = makeHarness();
      const host = await running(h);
      const conn = h.attempts[0].conn;
      conn.onPost = (m) => { const r = m as { id: number; method: string }; if (r.method === 'store.shutdown') { conn.deliver({ id: r.id, ok: true, result: { ok: true } }); conn.drop(); } };
      expect(host.agentRunning()).toBe(true);
      await host.stopAgent();
      expect((conn.sent as Array<{ method: string }>).map((r) => r.method)).toEqual(['store.shutdown']);
      expect(host.stoppedByUser()).toBe(true);
      expect(host.agentRunning()).toBe(false);
      expect(host.status()).toBe('unavailable');
      expect(host.health()).toMatchObject({ status: 'unavailable' });
      await expect(host.call('docs.get', { name: 'x' })).rejects.toMatchObject({ code: 'unavailable' });

      // Well past every backoff step: nothing reconnects by itself.
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(h.attempts).toHaveLength(1);

      const starting = host.retry();
      expect(h.attempts).toHaveLength(2);
      h.attempts[1].resolve({ type: 'ready', status: 'ready', health: HEALTH });
      await vi.advanceTimersByTimeAsync(0);
      await starting;
      expect(host.stoppedByUser()).toBe(false);
      expect(host.agentRunning()).toBe(true);
      expect(host.status()).toBe('ready');
    });

    it('a stop followed by crashes of the next agent still gets the normal crash policy', async () => {
      const h = makeHarness();
      const host = await running(h);
      const conn = h.attempts[0].conn;
      conn.onPost = (m) => { const r = m as { id: number; method: string }; if (r.method === 'store.shutdown') { conn.deliver({ id: r.id, ok: true, result: { ok: true } }); conn.drop(); } };
      await host.stopAgent();
      void host.retry();
      h.attempts[1].resolve({ type: 'ready', status: 'ready', health: HEALTH });
      await vi.advanceTimersByTimeAsync(0);
      h.attempts[1].conn.drop();
      expect(host.status()).toBe('degraded');
      await vi.advanceTimersByTimeAsync(500);
      expect(h.attempts).toHaveLength(3);
    });
  });
});
