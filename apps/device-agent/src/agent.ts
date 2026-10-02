import { randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createAgentPipeServer } from '@dude/agent-pipe';
import type { AgentClientConfig, AgentPipeConnection } from '@dude/agent-pipe';
import type { StoreHealth } from '@dude/contracts';
import { openDeviceStore } from './store/open-store.js';
import type { DeviceStore } from './store/open-store.js';
import { createRpcServer } from './rpc/server.js';
import type { RpcServer } from './rpc/server.js';
import { parseAgentConfig, readAgentConfig, saveAgentConfig } from './agent-config.js';
import type { StoredAgentConfig } from './agent-config.js';
import { readMachineGuid } from './machine-fingerprint.js';

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
  /** Test seam; defaults to reading the Windows MachineGuid. The agent reads it itself so clone detection never depends on the desktop. */
  machineGuid?: () => Promise<string | null>;
  randomBytes?: (n: number) => Uint8Array;
}

export type RunningAgent =
  | {
    status: 'listening';
    endpoint: string;
    close(): Promise<void>;
    /** Settles once the standalone start is over (the store was opened from `agent-config.json`, if there was one). */
    startup: Promise<void>;
  }
  | { status: 'already-running' };

interface Opened { server: RpcServer; store: DeviceStore | null; event: AgentReadyEvent }

const NO_CONFIG_MESSAGE = 'The agent has not received its configuration from the desktop yet.';

/**
 * The resident Device Agent: serves the closed RPC table over the per-user pipe to any number of
 * authenticated connections. The store opens from the last desktop-supplied config persisted in
 * `agent-config.json` as soon as the agent is listening (so it runs with no desktop), or from the
 * first connection's config when there is none. The agent reads the machine guid itself. A
 * connection whose config differs updates the file; the open store is not reopened.
 */
export async function runAgent(options: RunAgentOptions): Promise<RunningAgent> {
  const now = options.now ?? ((): Date => new Date());
  const bytes = options.randomBytes ?? ((n: number): Uint8Array => new Uint8Array(randomBytes(n)));
  const readGuid = options.machineGuid ?? ((): Promise<string | null> => readMachineGuid());
  let openPromise: Promise<Opened> | null = null;
  let stored: StoredAgentConfig | null = null;
  let exiting = false;

  const open = async (config: StoredAgentConfig): Promise<Opened> => {
    const machineGuid = await readGuid().catch(() => null);
    const result = openDeviceStore({
      dir: options.storeDir,
      machineGuid,
      appInfo: config.appInfo,
      capabilities: config.capabilities,
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

  const placeholder = (): Opened => ({
    server: createRpcServer(null, { now, randomBytes: bytes, storeDir: options.storeDir, unavailable: { status: 'incompatible', message: NO_CONFIG_MESSAGE } }),
    store: null,
    event: { type: 'ready', status: 'incompatible', message: NO_CONFIG_MESSAGE },
  });

  const bootFor = (current: Opened): AgentReadyEvent =>
    current.store && !current.server.closed ? { type: 'ready', status: 'ready', health: current.store.health() } : current.event;

  const started = await createAgentPipeServer({
    storeDir: options.storeDir,
    agentVersion: options.agentVersion,
    onConnection: async (connection: AgentPipeConnection, config: AgentClientConfig) => {
      const supplied = parseAgentConfig(config);
      if (supplied) {
        if (saveAgentConfig(options.storeDir, supplied, stored ?? readAgentConfig(options.storeDir))) stored = supplied;
        openPromise ??= open(supplied);
      }
      // With neither a stored config nor a usable one from this client the store cannot open: serve a placeholder
      // (health, shutdown) that is not cached, so the first real desktop connection still opens the store.
      const current = openPromise ? await openPromise : placeholder();
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

  // Standalone start: with a config persisted by an earlier desktop connection, open the store now.
  const startup = (async (): Promise<void> => {
    stored = readAgentConfig(options.storeDir);
    if (stored && !openPromise) openPromise = open(stored);
    await openPromise?.catch(() => undefined);
  })();

  const close = async (): Promise<void> => {
    // Close the store cleanly (checkpoint) unless a shutdown request already did.
    const current = await openPromise?.catch(() => null);
    if (current && !current.server.closed) await current.server.handle({ id: 0, method: 'store.shutdown', params: {} }).catch(() => undefined);
    try { rmSync(path.join(options.storeDir, PID_FILE), { force: true }); } catch { /* ignore */ }
    await started.close();
  };

  async function finish(): Promise<void> {
    if (exiting) return;
    exiting = true;
    await close();
    options.onExit(0);
  }

  return { status: 'listening', endpoint: started.endpoint, close, startup };
}
