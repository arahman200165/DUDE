import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectAgentPipe } from '@dude/agent-pipe';
import type { AgentPipeClient } from '@dude/agent-pipe';
import { runAgent } from './agent';
import type { RunningAgent } from './agent';
import { AGENT_CONFIG_FILE, parseAgentConfig, readAgentConfig } from './agent-config';
import { cleanupTemp, tempDir } from './testing/test-utils';

const APP_INFO = { appVersion: '1.0.0', platform: 'windows', os: '10.0', arch: 'x64' } as const;
const CAPABILITIES = { desktop: true, secureStorage: true };

const agents: RunningAgent[] = [];
const clients: AgentPipeClient[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const agent of agents.splice(0)) if (agent.status === 'listening') await agent.close();
  cleanupTemp();
});

async function start(storeDir: string, machineGuid: () => Promise<string | null> = async () => 'guid-A'): Promise<Extract<RunningAgent, { status: 'listening' }>> {
  const agent = await runAgent({ storeDir, agentVersion: '1.0.0', onExit: () => undefined, machineGuid });
  if (agent.status !== 'listening') throw new Error('not listening');
  agents.push(agent);
  return agent;
}

async function connect(storeDir: string, config: unknown): Promise<AgentPipeClient> {
  const client = await connectAgentPipe({ storeDir, config: config as never, timeoutMs: 5000 });
  clients.push(client);
  return client;
}

describe('agent standalone start (agent-config.json)', () => {
  it('opens the store at startup from a persisted config, before any desktop connects', async () => {
    const storeDir = tempDir();
    writeFileSync(path.join(storeDir, AGENT_CONFIG_FILE), JSON.stringify({ appInfo: APP_INFO, capabilities: CAPABILITIES }));
    const agent = await start(storeDir);
    await agent.startup;
    expect(existsSync(path.join(storeDir, 'dude-device.db'))).toBe(true);

    // A desktop that connects afterwards (with an unusable config) is served by the already-open store.
    const client = await connect(storeDir, { appInfo: {}, capabilities: {}, machineGuid: null });
    expect(client.boot).toMatchObject({ type: 'ready', status: 'ready' });
    const hydrated = await client.call('store.hydrate', {}) as { ok: boolean; result: { device: { deviceId: string } } };
    expect(hydrated.result.device.deviceId).toBeTruthy();
  });

  it('without a persisted config it waits for the first desktop, then persists that config', async () => {
    const storeDir = tempDir();
    const agent = await start(storeDir);
    await agent.startup;
    expect(existsSync(path.join(storeDir, 'dude-device.db'))).toBe(false);

    const placeholder = await connect(storeDir, { appInfo: {}, capabilities: {}, machineGuid: null });
    expect(placeholder.boot).toMatchObject({ status: 'incompatible' });
    expect(existsSync(path.join(storeDir, 'dude-device.db'))).toBe(false);
    placeholder.close();

    const desktop = await connect(storeDir, { appInfo: APP_INFO, capabilities: CAPABILITIES, machineGuid: null });
    expect(desktop.boot).toMatchObject({ type: 'ready', status: 'ready' });
    expect(readAgentConfig(storeDir)).toEqual({ appInfo: APP_INFO, capabilities: CAPABILITIES });
  });

  it('a connection with a different config updates the file', async () => {
    const storeDir = tempDir();
    const agent = await start(storeDir);
    await connect(storeDir, { appInfo: APP_INFO, capabilities: CAPABILITIES, machineGuid: null });
    await connect(storeDir, { appInfo: { ...APP_INFO, appVersion: '1.1.0' }, capabilities: { ...CAPABILITIES, secureStorage: false }, machineGuid: null });
    expect(agent.status).toBe('listening');
    expect(JSON.parse(readFileSync(path.join(storeDir, AGENT_CONFIG_FILE), 'utf8'))).toEqual({
      appInfo: { ...APP_INFO, appVersion: '1.1.0' },
      capabilities: { desktop: true, secureStorage: false },
    });
  });

  it('ignores a malformed config file and reads the machine guid itself', async () => {
    const storeDir = tempDir();
    writeFileSync(path.join(storeDir, AGENT_CONFIG_FILE), '{"appInfo": 3}');
    const guid = vi.fn(async () => 'guid-from-agent');
    const agent = await start(storeDir, guid);
    await agent.startup;
    expect(guid).not.toHaveBeenCalled();
    await connect(storeDir, { appInfo: APP_INFO, capabilities: CAPABILITIES, machineGuid: 'guid-from-desktop' });
    expect(guid).toHaveBeenCalledTimes(1);
  });

  it('validates the config shape', () => {
    expect(parseAgentConfig({ appInfo: APP_INFO, capabilities: CAPABILITIES })).not.toBeNull();
    expect(parseAgentConfig({ appInfo: APP_INFO, capabilities: { desktop: 'yes' } })).toBeNull();
    expect(parseAgentConfig({ appInfo: { ...APP_INFO, os: '' }, capabilities: {} })).toBeNull();
    expect(parseAgentConfig(null)).toBeNull();
  });

  it('store.checkpoint keeps the store open', async () => {
    const storeDir = tempDir();
    await start(storeDir);
    const client = await connect(storeDir, { appInfo: APP_INFO, capabilities: CAPABILITIES, machineGuid: null });
    expect(await client.call('store.checkpoint', {})).toMatchObject({ ok: true, result: { ok: true } });
    expect(await client.call('store.health', {})).toMatchObject({ ok: true, result: { status: 'ready' } });
  });
});
