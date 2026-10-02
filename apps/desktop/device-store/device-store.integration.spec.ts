vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => true },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { cleanupTemp, tempDir } from '../../device-agent/src/testing/test-utils';
import { openDeviceStore } from '../../device-agent/src/store/open-store';
import { createRpcServer } from '../../device-agent/src/rpc/server';
import { runAgent } from '../../device-agent/src/agent';
import type { RunningAgent } from '../../device-agent/src/agent';
import { deviceStoreDir, startDeviceAgent } from './agent-host';
import { createPipeTransport } from './agent-transport';
import { createInProcessClient } from './store-client';

const running: RunningAgent[] = [];
afterEach(async () => {
  for (const agent of running.splice(0)) if (agent.status === 'listening') await agent.close();
  cleanupTemp();
});

const deps = { now: () => new Date(), randomBytes: (n: number) => new Uint8Array(randomBytes(n)) };
const APP_INFO = { appVersion: '1.0.0', platform: 'windows', os: '10', arch: 'x64' } as const;

/**
 * The real agent service (pipe server, handshake, RPC) running in this process, started on demand by the
 * production transport's `spawn` seam, exactly as the desktop would spawn the process. Everything between
 * the host and the store (framing, HMAC handshake, the bytes codec) is the production code.
 */
function pipeTransport(userDataDir: string, spawned: { count: number }) {
  const storeDir = deviceStoreDir(userDataDir);
  return createPipeTransport({
    storeDir,
    appVersion: '1.0.0',
    readyTimeoutMs: 10_000,
    shutdownCapMs: 3_000,
    launch: () => ({ command: 'unused', args: [] }),
    spawnProcess: () => {
      spawned.count++;
      void runAgent({ storeDir, agentVersion: '1.0.0', onExit: () => undefined }).then((agent) => { running.push(agent); });
    },
    log: () => undefined,
  });
}

describe('device store host against the real agent service (named pipe)', () => {
  it('spawns the agent on demand, commits kv and entities through the host and hydrates them back', async () => {
    const userDataDir = tempDir();
    const spawned = { count: 0 };
    const host = await startDeviceAgent({
      userDataDir, appInfo: APP_INFO, capabilities: {}, machineGuid: 'guid-1', transport: pipeTransport(userDataDir, spawned),
    });
    expect(spawned.count).toBe(1);
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

  it('carries secret ciphertext bytes intact and lets a second connection share the same agent', async () => {
    const userDataDir = tempDir();
    const spawned = { count: 0 };
    const first = await startDeviceAgent({ userDataDir, appInfo: APP_INFO, capabilities: {}, machineGuid: 'guid-1', transport: pipeTransport(userDataDir, spawned) });
    const ciphertext = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    await first.call('secrets.set', { purpose: 'ai.llmApiKey', ciphertext });
    const second = await startDeviceAgent({ userDataDir, appInfo: APP_INFO, capabilities: {}, machineGuid: 'guid-1', transport: pipeTransport(userDataDir, spawned) });
    expect(spawned.count).toBe(1);
    const stored = await second.call('secrets.getCiphertext', { purpose: 'ai.llmApiKey' });
    expect(stored.ciphertext).toBeInstanceOf(Uint8Array);
    expect([...stored.ciphertext!]).toEqual([...ciphertext]);
    await second.shutdown();
    await vi.waitFor(() => expect(first.status()).toBe('degraded'));
    await first.shutdown();
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
