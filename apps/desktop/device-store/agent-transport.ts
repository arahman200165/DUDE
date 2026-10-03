import { spawn as spawnChild } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { join } from 'node:path';
import { AgentConnectError, connectAgentPipe } from '@dude/agent-pipe';
import type { AgentClientConfig, AgentPipeClient, ConnectAgentPipeOptions } from '@dude/agent-pipe';

/** One authenticated connection to the Device Agent. */
export interface AgentConnection {
  /** The agent's `ready` payload (store status and health), as the utility process used to post it. */
  readonly boot: unknown;
  post(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  /** Fires once when the connection ends for any reason; the host treats it as the old child exit. */
  onClose(listener: () => void): void;
  close(): void;
}

export type AgentConnectConfig = AgentClientConfig;

/** How the host reaches the agent; the real one is a named pipe, specs inject fakes. */
export interface AgentTransport {
  connect(config: AgentConnectConfig): Promise<AgentConnection>;
  /** Starts the agent process (idempotent at the agent: a second instance exits when the pipe is taken). */
  spawn(): void;
}

export interface AgentLaunch { command: string; args: string[]; env?: NodeJS.ProcessEnv }

export interface PipeTransportOptions {
  storeDir: string;
  /** The desktop's version; an agent reporting another version is replaced (once). `null` skips the check (unpackaged dev, where the agent is the sibling bundle of the same build). */
  appVersion: string | null;
  launch: () => AgentLaunch;
  /** Total time to wait for a freshly spawned agent to accept connections. */
  readyTimeoutMs: number;
  shutdownCapMs: number;
  /** Test seams. */
  connectPipe?: (options: ConnectAgentPipeOptions) => Promise<AgentPipeClient>;
  spawnProcess?: (launch: AgentLaunch) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

const RETRY_DELAY_MS = 100;
const SKEW_SHUTDOWN_ID = -1_000_000;

/** Packaged: the SEA `dude-agent.exe` beside the app. Dev/unpackaged: Electron's own binary running the bundled script as Node. */
export function resolveAgentLaunch(opts: { isPackaged: boolean; resourcesPath: string; execPath: string; scriptDir: string; platform: NodeJS.Platform }, storeDir: string): AgentLaunch {
  if (opts.isPackaged) {
    return { command: join(opts.resourcesPath, opts.platform === 'win32' ? 'dude-agent.exe' : 'dude-agent'), args: ['--store-dir', storeDir] };
  }
  // Test-only override (unpackaged builds only): run the agent on a real Node instead of Electron's. Electron's BoringSSL
  // cannot verify the Hub's self-signed certificate as a trust anchor, which the packaged SEA agent (OpenSSL) can. The
  // two-desktop sync e2e (`e2e/sync`) sets it; nothing else does.
  const e2eNode = process.env['DUDE_E2E_AGENT_NODE'];
  if (e2eNode) return { command: e2eNode, args: [join(opts.scriptDir, 'device-agent.js'), '--store-dir', storeDir] };
  return {
    command: opts.execPath,
    args: [join(opts.scriptDir, 'device-agent.js'), '--store-dir', storeDir],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  };
}

/**
 * The agent outlives the desktop (PD-026): detached into its own process group with no inherited stdio,
 * then unreferenced, so quitting Electron neither stops it nor waits for it.
 */
export function agentSpawnOptions(launch: AgentLaunch): SpawnOptions {
  return { windowsHide: true, stdio: 'ignore', detached: true, shell: false, env: launch.env ?? process.env };
}

function adapt(client: AgentPipeClient): AgentConnection {
  return {
    boot: client.boot,
    post: (message) => client.post(message),
    onMessage: (listener) => client.onMessage(listener),
    onClose: (listener) => client.onClose(() => listener()),
    close: () => client.close(),
  };
}

export function createPipeTransport(options: PipeTransportOptions): AgentTransport {
  const connectPipe = options.connectPipe ?? connectAgentPipe;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const log = options.log ?? ((message: string) => console.warn(`[device-agent] ${message}`));
  const spawnProcess = options.spawnProcess ?? ((launch: AgentLaunch): void => {
    const child = spawnChild(launch.command, launch.args, agentSpawnOptions(launch));
    child.on('error', (error) => log(`could not start the agent: ${error.message}`));
    child.unref();
  });
  const spawn = (): void => spawnProcess(options.launch());

  /** Asks an agent of another version to exit and waits (bounded) for the connection to close. */
  async function retire(client: AgentPipeClient): Promise<void> {
    const closed = new Promise<void>((resolve) => client.onClose(() => resolve()));
    client.post({ id: SKEW_SHUTDOWN_ID, method: 'store.shutdown', params: {} });
    let cap: ReturnType<typeof setTimeout> | undefined;
    const capped = new Promise<void>((resolve) => { cap = setTimeout(resolve, options.shutdownCapMs); });
    await Promise.race([closed, capped]);
    clearTimeout(cap);
    client.close();
  }

  return {
    spawn,
    async connect(config) {
      const deadline = now() + options.readyTimeoutMs;
      let spawned = false;
      let skewHandled = false;
      for (;;) {
        const remaining = Math.max(1, deadline - now());
        try {
          const client = await connectPipe({ storeDir: options.storeDir, config, timeoutMs: remaining });
          if (options.appVersion !== null && client.agentVersion !== options.appVersion && !skewHandled) {
            skewHandled = true;
            spawned = false;
            log(`agent version ${client.agentVersion} does not match ${options.appVersion}; restarting it`);
            await retire(client);
            continue;
          }
          if (options.appVersion !== null && client.agentVersion !== options.appVersion) log(`agent version ${client.agentVersion} still differs from ${options.appVersion} after a restart`);
          return adapt(client);
        } catch (error) {
          if (!(error instanceof AgentConnectError) || error.code !== 'no-server') throw error;
          if (now() >= deadline) throw error;
          if (!spawned) { spawned = true; spawn(); }
          await sleep(RETRY_DELAY_MS);
        }
      }
    },
  };
}
