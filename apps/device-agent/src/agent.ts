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
import { windowsDpapi } from './native/windows-sys-client.js';
import type { DpapiPort } from './native/windows-sys-client.js';
import { readDeviceRecord } from './store/identity.js';
import { uuidv7 } from '@dude/persistence';
import { createHubRuntime } from './hub/index.js';
import { createSyncRuntime } from './sync/sync-runtime.js';
import type { SyncIntervals, SyncRuntime } from './sync/sync-runtime.js';
import type { HubRuntime, HubRuntimeDeps } from './hub/index.js';

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
  /** Test seams for the Hub connection; production uses the Windows DPAPI port, the pinned node:https transport and the real timings. */
  dpapi?: DpapiPort;
  hubTimings?: HubRuntimeDeps['timings'];
  hubCreateTransport?: HubRuntimeDeps['createTransport'];
  syncIntervals?: Partial<SyncIntervals>;
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

interface Opened { server: RpcServer; store: DeviceStore | null; event: AgentReadyEvent; hub?: HubRuntime; sync?: SyncRuntime }

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
  const connections = new Set<AgentPipeConnection>();

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
      const store = result.store;
      const hub = createHubRuntime({
        db: store.db, dpapi: options.dpapi ?? windowsDpapi, now, timings: options.hubTimings, createTransport: options.hubCreateTransport,
        device: () => readDeviceRecord(store.db, config.capabilities), backupDir: path.join(options.storeDir, 'backups'),
      });
      // Push every Hub state change to all connected desktops (frames without an id; clients ignore frames they do not know).
      hub.manager.onChange((status) => {
        for (const connection of [...connections]) void connection.send({ type: 'event', event: 'hub.status', status }).catch(() => undefined);
      });
      const sync = createSyncRuntime({
        db: store.db, manager: hub.manager, now, intervals: options.syncIntervals, backupDir: path.join(options.storeDir, 'backups'),
        newOpId: () => uuidv7(bytes, () => now().getTime()),
      });
      sync.onStatus((status) => {
        for (const connection of [...connections]) void connection.send({ type: 'event', event: 'sync.status', status }).catch(() => undefined);
      });
      sync.onApplied((changes) => {
        for (const connection of [...connections]) void connection.send({ type: 'event', event: 'sync.applied', changes }).catch(() => undefined);
      });
      // The Hub connection lives as long as the store is open, with or without a desktop attached; sync rides on it.
      try { hub.manager.start(); } catch { /* the store stays usable; the connection reports its own state */ }
      try { sync.start(); } catch { /* the store stays usable; sync reports its own state */ }
      return {
        server: createRpcServer(store, { now, randomBytes: bytes, storeDir: options.storeDir, hub, sync }),
        store,
        event: { type: 'ready', status: 'ready', health: result.health },
        hub,
        sync,
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
      connections.add(connection);
      connection.onClose(() => { connections.delete(connection); });
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
    current?.sync?.stop();
    current?.hub?.manager.stop();
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
