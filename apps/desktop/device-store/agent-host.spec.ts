vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' },
  safeStorage: { isEncryptionAvailable: () => true },
  utilityProcess: { fork: vi.fn() },
  MessageChannelMain: class {},
}));

import { startDeviceAgent, DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { makeHarness } from './agent-host.testing';
import type { Harness } from './agent-host.testing';

const HEALTH = { status: 'ready', schemaVersion: 1, minReaderVersion: 1, sizeBytes: 0, outbox: { pending: 0, maxRows: 0, backpressure: false }, legacyImport: 'none' };
const APP_INFO = { appVersion: '1.0.0', platform: 'windows', os: '10', arch: 'x64' } as const;

function begin(h: Harness): Promise<DeviceStoreHost> {
  return startDeviceAgent({ userDataDir: 'C:\\ud', appInfo: APP_INFO, capabilities: { desktop: true }, machineGuid: 'g', fork: h.fork, createChannel: h.createChannel, agentPath: 'agent.js' });
}
const ready = (h: Harness, index = h.ports.length - 1): void => h.ports[index].port1.deliver({ type: 'ready', status: 'ready', health: HEALTH });

describe('agent host', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('transfers port2 to the child only and keeps port1; init carries the store dir and config', async () => {
    const h = makeHarness();
    const starting = begin(h);
    expect(h.children).toHaveLength(1);
    const { message, transfer } = h.children[0].posted[0];
    expect(transfer).toEqual([h.ports[0].port2]);
    expect(transfer).not.toContain(h.ports[0].port1);
    expect(message).toMatchObject({ config: { machineGuid: 'g', appInfo: APP_INFO, capabilities: { desktop: true } } });
    expect((message as { config: { dir: string } }).config.dir).toMatch(/device-store$/);
    ready(h);
    const host = await starting;
    expect(host.status()).toBe('ready');
    expect(host.health()).toEqual(HEALTH);
  });

  it('waits for the ready handshake and reports an incompatible store', async () => {
    const h = makeHarness();
    const starting = begin(h);
    h.ports[0].port1.deliver({ type: 'ready', status: 'incompatible', message: 'newer store' });
    const host = await starting;
    expect(host.status()).toBe('incompatible');
    expect(host.health()).toMatchObject({ status: 'incompatible', message: 'newer store' });
  });

  it('correlates responses by id, including out of order, and maps agent errors', async () => {
    const h = makeHarness();
    const starting = begin(h);
    ready(h);
    const host = await starting;
    const a = host.call('docs.get', { name: 'a' });
    const b = host.call('docs.get', { name: 'b' });
    const c = host.call('docs.get', { name: 'c' });
    const sent = h.ports[0].port1.sent as Array<{ id: number; method: string; params: { name: string } }>;
    expect(sent.map((r) => r.params.name)).toEqual(['a', 'b', 'c']);
    h.ports[0].port1.deliver({ id: sent[1].id, ok: true, result: 'B' });
    h.ports[0].port1.deliver({ id: sent[0].id, ok: true, result: 'A' });
    h.ports[0].port1.deliver({ id: sent[2].id, ok: false, error: { code: 'invalid-params', message: 'nope' } });
    expect(await a).toBe('A');
    expect(await b).toBe('B');
    await expect(c).rejects.toMatchObject({ code: 'invalid-params', message: 'nope' });
  });

  it('times out a call that is never answered', async () => {
    const h = makeHarness();
    const starting = begin(h);
    ready(h);
    const host = await starting;
    const call = host.call('docs.get', { name: 'x' }, { timeoutMs: 250 });
    const assertion = expect(call).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });

  it('rejects in-flight calls when the child exits, then restarts after 500 ms', async () => {
    const h = makeHarness();
    const starting = begin(h);
    ready(h);
    const host = await starting;
    const healths: string[] = [];
    host.onHealth((x) => healths.push(x.status));
    const inFlight = host.call('docs.get', { name: 'x' });
    const assertion = expect(inFlight).rejects.toMatchObject({ code: 'agent-exited' });
    h.children[0].exit(1);
    await assertion;
    expect(host.status()).toBe('degraded');
    expect(healths).toEqual(['degraded']);
    await vi.advanceTimersByTimeAsync(499);
    expect(h.children).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.children).toHaveLength(2);
    ready(h);
    expect(host.status()).toBe('ready');
    expect(healths).toEqual(['degraded', 'ready']);
  });

  it('backs off 500 ms, 2 s, 8 s and then goes unavailable after more than 3 crashes in 2 minutes', async () => {
    const h = makeHarness();
    const starting = begin(h);
    ready(h);
    const host = await starting;
    const healths: string[] = [];
    host.onHealth((x) => healths.push(x.status));

    h.children[0].exit(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.children).toHaveLength(2);
    h.children[1].exit(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(h.children).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.children).toHaveLength(3);
    h.children[2].exit(1);
    await vi.advanceTimersByTimeAsync(7999);
    expect(h.children).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.children).toHaveLength(4);
    h.children[3].exit(1);
    expect(host.status()).toBe('unavailable');
    expect(healths.at(-1)).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.children).toHaveLength(4);

    await expect(host.call('docs.get', { name: 'x' })).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('retry restarts an unavailable host and resets the crash counter', async () => {
    const h = makeHarness();
    const starting = begin(h);
    ready(h);
    const host = await starting;
    h.children[0].exit(1);
    await vi.advanceTimersByTimeAsync(500);
    h.children[1].exit(1);
    await vi.advanceTimersByTimeAsync(2000);
    h.children[2].exit(1);
    await vi.advanceTimersByTimeAsync(8000);
    h.children[3].exit(1);
    expect(host.status()).toBe('unavailable');

    const retried = host.retry();
    expect(h.children).toHaveLength(5);
    ready(h);
    await retried;
    expect(host.status()).toBe('ready');
  });

  it('queues calls made while restarting and flushes them once the new child is ready', async () => {
    const h = makeHarness();
    const starting = begin(h);
    ready(h);
    const host = await starting;
    h.children[0].exit(1);
    const queued = host.call('docs.get', { name: 'queued' });
    expect(h.ports[0].port1.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.ports[1].port1.sent).toHaveLength(0);
    ready(h);
    const [request] = h.ports[1].port1.sent as Array<{ id: number; method: string }>;
    expect(request.method).toBe('docs.get');
    h.ports[1].port1.deliver({ id: request.id, ok: true, result: 'v' });
    expect(await queued).toBe('v');
  });

  it('rejects queued calls when the store becomes unavailable', async () => {
    const h = makeHarness();
    const starting = begin(h);
    ready(h);
    const host = await starting;
    h.children[0].exit(1);
    const queued = host.call('docs.get', { name: 'q' }, { timeoutMs: 600_000 });
    const assertion = expect(queued).rejects.toMatchObject({ code: 'unavailable' });
    for (let i = 1; i <= 3; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
      h.children[i].exit(1);
    }
    await assertion;
  });

  it('kills a child that never becomes ready and reports degraded without blocking forever', async () => {
    const h = makeHarness();
    const starting = begin(h);
    await vi.advanceTimersByTimeAsync(10_000);
    const host = await starting;
    expect(h.children[0].killed).toBe(true);
    expect(host.status()).toBe('degraded');
  });

  it('shuts down through store.shutdown and the child exit', async () => {
    const h = makeHarness();
    const starting = begin(h);
    ready(h);
    const host = await starting;
    const done = host.shutdown();
    await vi.advanceTimersByTimeAsync(0);
    const [request] = h.ports[0].port1.sent as Array<{ id: number; method: string }>;
    expect(request.method).toBe('store.shutdown');
    h.ports[0].port1.deliver({ id: request.id, ok: true, result: { ok: true } });
    await vi.advanceTimersByTimeAsync(0);
    h.children[0].exit(0);
    await done;
    expect(h.children[0].killed).toBe(false);
    expect(host.status()).toBe('unavailable');
    expect(h.children).toHaveLength(1);
    await expect(host.call('docs.get', { name: 'x' })).rejects.toBeInstanceOf(DeviceStoreError);
  });

  it('kills the child if it does not exit within 3 s of shutdown', async () => {
    const h = makeHarness();
    const starting = begin(h);
    ready(h);
    const host = await starting;
    h.children[0].ignoreKill = true;
    const done = host.shutdown();
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    expect(h.children[0].killed).toBe(true);
  });
});
