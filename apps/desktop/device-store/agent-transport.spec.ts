import { AgentConnectError } from '@dude/agent-pipe';
import type { AgentPipeClient, ConnectAgentPipeOptions } from '@dude/agent-pipe';
import { createPipeTransport, resolveAgentLaunch } from './agent-transport';

const CONFIG = { appInfo: { appVersion: '1.0.0' }, capabilities: {}, machineGuid: 'g' };

function fakeClient(agentVersion: string, behaviour: { closeOnShutdown?: boolean } = {}) {
  let closeListener: (() => void) | undefined;
  const posted: unknown[] = [];
  const client: AgentPipeClient = {
    boot: { type: 'ready', status: 'ready' },
    agentVersion,
    post: (message) => { posted.push(message); if (behaviour.closeOnShutdown) setTimeout(() => closeListener?.(), 0); },
    onMessage: () => undefined,
    onClose: (listener) => { closeListener = listener; },
    call: async () => ({}),
    close: () => undefined,
  };
  return { client, posted };
}

const noServer = (): AgentConnectError => new AgentConnectError('no-server', 'nobody');

function transportWith(results: Array<() => Promise<AgentPipeClient>>, extra: { appVersion?: string } = {}) {
  const spawned: number[] = [];
  const attempts: ConnectAgentPipeOptions[] = [];
  let clock = 0;
  const transport = createPipeTransport({
    storeDir: 'C:\\store',
    appVersion: extra.appVersion ?? '1.0.0',
    launch: () => ({ command: 'agent', args: [] }),
    readyTimeoutMs: 1_000,
    shutdownCapMs: 50,
    connectPipe: (options) => { attempts.push(options); const next = results.shift(); if (!next) throw new Error('no more scripted results'); return next(); },
    spawnProcess: () => { spawned.push(clock); },
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
    log: () => undefined,
  });
  return { transport, spawned, attempts };
}

describe('pipe transport', () => {
  it('connects to a running agent without spawning one', async () => {
    const { client } = fakeClient('1.0.0');
    const { transport, spawned, attempts } = transportWith([async () => client]);
    const conn = await transport.connect(CONFIG);
    expect(conn.boot).toEqual({ type: 'ready', status: 'ready' });
    expect(spawned).toHaveLength(0);
    expect(attempts[0].config).toBe(CONFIG);
  });

  it('spawns the agent once when nothing listens, then keeps retrying until it accepts', async () => {
    const { client } = fakeClient('1.0.0');
    const refuse = async (): Promise<AgentPipeClient> => { throw noServer(); };
    const { transport, spawned, attempts } = transportWith([refuse, refuse, refuse, async () => client]);
    await transport.connect(CONFIG);
    expect(spawned).toHaveLength(1);
    expect(attempts).toHaveLength(4);
  });

  it('gives up with the no-server error once the ready timeout has passed', async () => {
    const refuse = async (): Promise<AgentPipeClient> => { throw noServer(); };
    const { transport, spawned } = transportWith(Array.from({ length: 50 }, () => refuse));
    await expect(transport.connect(CONFIG)).rejects.toMatchObject({ code: 'no-server' });
    expect(spawned).toHaveLength(1);
  });

  it('does not retry or spawn on a handshake failure', async () => {
    const { transport, spawned, attempts } = transportWith([async () => { throw new AgentConnectError('handshake-failed', 'bad key'); }]);
    await expect(transport.connect(CONFIG)).rejects.toMatchObject({ code: 'handshake-failed' });
    expect(spawned).toHaveLength(0);
    expect(attempts).toHaveLength(1);
  });

  it('on version skew asks the old agent to shut down, waits for the close, spawns a matching one and reconnects', async () => {
    const old = fakeClient('0.9.0', { closeOnShutdown: true });
    const fresh = fakeClient('1.0.0');
    const { transport, spawned, attempts } = transportWith([async () => old.client, async () => { throw noServer(); }, async () => fresh.client]);
    const conn = await transport.connect(CONFIG);
    expect(old.posted).toEqual([expect.objectContaining({ method: 'store.shutdown' })]);
    expect(spawned).toHaveLength(1);
    expect(attempts).toHaveLength(3);
    expect(conn.boot).toEqual(fresh.client.boot);
  });

  it('accepts a still-mismatched agent after one restart attempt instead of looping', async () => {
    const first = fakeClient('0.9.0', { closeOnShutdown: true });
    const second = fakeClient('0.9.0');
    const { transport, attempts } = transportWith([async () => first.client, async () => second.client]);
    await transport.connect(CONFIG);
    expect(attempts).toHaveLength(2);
    expect(second.posted).toHaveLength(0);
  });

  it('caps the wait for an old agent that never closes', async () => {
    const stubborn = fakeClient('0.9.0');
    const fresh = fakeClient('1.0.0');
    const { transport } = transportWith([async () => stubborn.client, async () => fresh.client]);
    await expect(transport.connect(CONFIG)).resolves.toBeTruthy();
  });
});

describe('resolveAgentLaunch', () => {
  const base = { resourcesPath: 'C:\\app\\resources', execPath: 'C:\\app\\electron.exe', scriptDir: 'C:\\app\\dist\\electron', platform: 'win32' as const };
  it('runs the packaged dude-agent.exe from resources', () => {
    expect(resolveAgentLaunch({ ...base, isPackaged: true }, 'S')).toEqual({ command: expect.stringMatching(/dude-agent\.exe$/), args: ['--store-dir', 'S'] });
  });
  it('runs the bundled script through Electron as Node when unpackaged', () => {
    const launch = resolveAgentLaunch({ ...base, isPackaged: false }, 'S');
    expect(launch.command).toBe(base.execPath);
    expect(launch.args[0]).toMatch(/device-agent\.js$/);
    expect(launch.args.slice(1)).toEqual(['--store-dir', 'S']);
    expect(launch.env?.ELECTRON_RUN_AS_NODE).toBe('1');
  });
});
