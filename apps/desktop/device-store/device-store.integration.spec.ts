vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' },
  safeStorage: { isEncryptionAvailable: () => true },
  utilityProcess: { fork: vi.fn() },
  MessageChannelMain: class {},
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

import { randomBytes } from 'node:crypto';
import { cleanupTemp, tempDir } from '../../device-agent/src/testing/test-utils';
import { openDeviceStore } from '../../device-agent/src/store/open-store';
import { createRpcServer } from '../../device-agent/src/rpc/server';
import { startDeviceAgent } from './agent-host';
import { makeHarness } from './agent-host.testing';
import { createInProcessClient } from './store-client';

afterEach(cleanupTemp);

const deps = { now: () => new Date(), randomBytes: (n: number) => new Uint8Array(randomBytes(n)) };

/** A fake child that runs the real state service in-process behind the fake MessageChannel. */
function inProcessHarness() {
  return makeHarness((child, channel) => {
    child.onInit = (message) => {
      const { config } = message as { config: Parameters<typeof openDeviceStore>[0] };
      const opened = openDeviceStore({ ...config, now: deps.now, randomBytes: deps.randomBytes });
      if (opened.status !== 'ready') throw new Error(`store not ready: ${opened.message}`);
      const server = createRpcServer(opened.store, deps);
      channel.port1.onPost = (request) => {
        void server.handle(request).then((response) => {
          channel.port1.deliver(response);
          if (server.closed) setImmediate(() => child.exit(0));
        });
      };
      channel.port1.deliver({ type: 'ready', status: 'ready', health: opened.health });
    };
  });
}

describe('device store host against the real state service (in-process child)', () => {
  it('commits kv and entities through the host and hydrates them back', async () => {
    const h = inProcessHarness();
    const host = await startDeviceAgent({
      userDataDir: tempDir(), appInfo: { appVersion: '1.0.0', platform: 'windows', os: '10', arch: 'x64' }, capabilities: {}, machineGuid: 'guid-1',
      fork: h.fork, createChannel: h.createChannel,
    });
    expect(host.status()).toBe('ready');

    expect(await host.call('kv.commit', { mutations: [
      { namespace: 'base64', key: 'mode', value: 'decode', policy: 'local' },
      { namespace: '__favorites__', key: 'pinned', value: ['a'], policy: 'local' },
    ] })).toEqual({ count: 2 });
    expect(await host.call('entity.commit', { entityType: 'favorite', entityId: 'tool:base64', op: 'upsert', payload: { id: 'tool:base64', kind: 'tool', targetId: 'base64', order: 0 } })).toMatchObject({ ok: true });

    const boot = await host.call('store.hydrate', {});
    expect(boot.status).toBe('ready');
    expect(boot.device?.deviceId).toBeTruthy();
    expect(boot.records).toEqual([{ entityType: 'favorite', entityId: 'tool:base64', payload: expect.objectContaining({ targetId: 'base64' }) }]);
    expect(boot.kv).toEqual(expect.arrayContaining([
      { namespace: 'base64', key: 'mode', value: 'decode' },
      { namespace: '__favorites__', key: 'pinned', value: ['a'] },
    ]));

    expect(await host.call('store.cleanExit', { action: 'launch' })).toEqual({ previous: 'none' });
    await host.shutdown();
    expect(host.status()).toBe('unavailable');
  });

  it('an in-process client routes through the same server', async () => {
    const opened = openDeviceStore({ dir: tempDir(), machineGuid: null, appInfo: { appVersion: '1', platform: 'windows', os: 'x', arch: 'x64' }, capabilities: {}, ...deps });
    if (opened.status !== 'ready') throw new Error('not ready');
    const client = createInProcessClient(createRpcServer(opened.store, deps).handle);
    await client.call('kv.commit', { mutations: [{ namespace: 'a', key: 'b', value: 1, policy: 'local' }] });
    expect((await client.call('store.hydrate', {})).kv).toEqual([{ namespace: 'a', key: 'b', value: 1 }]);
    await client.shutdown();
    await expect(client.call('store.health', {})).rejects.toMatchObject({ code: 'unavailable' });
  });
});
