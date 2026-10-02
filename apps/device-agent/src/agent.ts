import { randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createAgentPipeServer } from '@dude/agent-pipe';
import type { AgentClientConfig, AgentPipeConnection } from '@dude/agent-pipe';
import type { StoreHealth } from '@dude/contracts';
import type { DeviceCapabilities } from '@dude/persistence';
import { openDeviceStore } from './store/open-store.js';
import type { DeviceStore } from './store/open-store.js';
import type { AppInfo } from './store/identity.js';
import { createRpcServer } from './rpc/server.js';
import type { RpcServer } from './rpc/server.js';

/** Sent as `ready.boot` on every authenticated connection before any request is served. */
export type AgentReadyEvent =
  | { type: 'ready'; status: 'ready'; health: StoreHealth }
  | { type: 'ready'; status: 'incompatible' | 'corrupt'; message: string };

export const PID_FILE = 'agent.pid';

export interface RunAgentOptions {
  storeDir: string;
  agentVersion: string;
  /** Called when the agent should end the process (shutdown request). The entry point passes `process.exit`. */
  onExit: (code: number) => void;
  now?: () => Date;
  randomBytes?: (n: number) => Uint8Array;
}

export type RunningAgent =
  | { status: 'listening'; endpoint: string; close(): Promise<void> }
  | { status: 'already-running' };

interface Opened { server: RpcServer; store: DeviceStore | null; event: AgentReadyEvent }

/**
 * The resident Device Agent: serves the closed RPC table over the per-user pipe to any number of
 * authenticated connections. The store opens lazily from the first connection's config (machine
 * guid, app info and capabilities come from the desktop) and is shared by every later connection.
 */
export async function runAgent(options: RunAgentOptions): Promise<RunningAgent> {
  const now = options.now ?? ((): Date => new Date());
  const bytes = options.randomBytes ?? ((n: number): Uint8Array => new Uint8Array(randomBytes(n)));
  let opened: Opened | null = null;
  let exiting = false;

  const open = (config: AgentClientConfig): Opened => {
    const result = openDeviceStore({
      dir: options.storeDir,
      machineGuid: config.machineGuid,
      appInfo: config.appInfo as AppInfo,
      capabilities: config.capabilities as DeviceCapabilities,
      now,
      randomBytes: bytes,
    });
    if (result.status === 'ready') {
      return {
        server: createRpcServer(result.store, { now, randomBytes: bytes, storeDir: options.storeDir }),
        store: result.store,
        event: { type: 'ready', status: 'ready', health: result.health },
      };
    }
    return {
      server: createRpcServer(null, { now, randomBytes: bytes, storeDir: options.storeDir, unavailable: { status: result.status, message: result.message } }),
      store: null,
      event: { type: 'ready', status: result.status, message: result.message },
    };
  };

  const bootFor = (current: Opened): AgentReadyEvent =>
    current.store && !current.server.closed ? { type: 'ready', status: 'ready', health: current.store.health() } : current.event;

  const started = await createAgentPipeServer({
    storeDir: options.storeDir,
    agentVersion: options.agentVersion,
    onConnection: (connection: AgentPipeConnection, config: AgentClientConfig) => {
      opened ??= open(config);
      const current = opened;
      // Requests on one connection are answered in order; node:sqlite serialises the work itself.
      let chain: Promise<void> = Promise.resolve();
      connection.onMessage((message) => {
        chain = chain.then(async () => {
          const response = await current.server.handle(message);
          await connection.send(response).catch(() => undefined);
          if (current.server.closed) void finish();
        });
      });
      return bootFor(current);
    },
  });
  if (started.status === 'already-running') return started;

  try { writeFileSync(path.join(options.storeDir, PID_FILE), String(process.pid)); } catch { /* the pid file is a convenience for cleanup */ }

  const close = async (): Promise<void> => {
    try { rmSync(path.join(options.storeDir, PID_FILE), { force: true }); } catch { /* ignore */ }
    await started.close();
  };

  async function finish(): Promise<void> {
    if (exiting) return;
    exiting = true;
    await close();
    options.onExit(0);
  }

  return { status: 'listening', endpoint: started.endpoint, close };
}
