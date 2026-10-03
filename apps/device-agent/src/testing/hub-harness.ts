import { execFileSync, execSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createHubClient } from '@dude/api-client';
import type { AgentMethod, AgentMethodMap } from '@dude/contracts';
import { HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION } from '@dude/contracts/hub';
import { uuidv7 } from '@dude/persistence';
import { createHubRuntime } from '../hub/index.js';
import type { HubRuntime, HubRuntimeDeps } from '../hub/index.js';
import { createPinnedTransport, pinnedTlsOptions, spkiSha256Of } from '../hub/pinned-transport.js';
import type { DpapiPort } from '../native/windows-sys-client.js';
import { createRpcServer } from '../rpc/server.js';
import type { RpcServer } from '../rpc/server.js';
import { readDeviceRecord } from '../store/identity.js';
import { getEnrollment } from '../store/repos/hub-enrollment.repo.js';
import type { DeviceStore } from '../store/open-store.js';
import { createSyncRuntime } from '../sync/sync-runtime.js';
import type { SyncRuntime } from '../sync/sync-runtime.js';
import { openReady, tempDir } from './test-utils.js';

/** Shared helpers for the integration specs that run the compiled Hub bundle against real Device Agents. */

export const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const BUNDLE = path.join(ROOT, 'dist', 'hub', 'dude-hub.cjs');
export const CAPABILITIES = { desktop: true, filesystem: true, secureStorage: true };

/** TEST-ONLY DPAPI stand-in: AES-GCM under a per-process random key, bound to the entropy like the real port. */
export function fakeDpapi(): DpapiPort {
  const key = randomBytes(32);
  return {
    async protect(data, entropy) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(entropy ?? []));
      const body = Buffer.concat([cipher.update(data), cipher.final()]);
      return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), body]));
    },
    async unprotect(blob, entropy) {
      const buf = Buffer.from(blob);
      const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      decipher.setAuthTag(buf.subarray(12, 28));
      decipher.setAAD(Buffer.from(entropy ?? []));
      return new Uint8Array(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]));
    },
  };
}

export async function waitFor<T>(what: string, fn: () => T | undefined | false | Promise<T | undefined | false>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export interface RawResponse { status: number; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> }

export interface HubHandle {
  readonly dir: string;
  readonly port: number;
  cert(): string;
  /** A pinned raw request (cookie sign-in is browser-only, so the first pairing code needs it). */
  request(method: string, requestPath: string, body: unknown, headers?: Record<string, string>): Promise<RawResponse>;
  /** Runs a `dude-hub` CLI command against this data dir. */
  cli(...args: string[]): string;
  /** Signs in as the owner with a cookie session and returns the headers for owner-cookie requests. */
  ownerHeaders(password: string): Promise<Record<string, string>>;
  /** Mints one pairing string through an owner cookie session. */
  pairingString(password: string): Promise<string>;
  /** Stops the process (no cleanup of the data dir). */
  stop(): Promise<void>;
  /** Starts the process again on the same data dir and port, optionally with extra env. */
  restart(env?: Record<string, string>): Promise<void>;
  /** Stops the process and removes the data dir. */
  dispose(): Promise<void>;
  output(): string;
}

export interface StartHubOptions { env?: Record<string, string>; bootstrap?: { password: string } }

/** Spawns `dude-hub run` on a fresh data dir with relaxed (test-only) rate limits. Requires `npm run hub:compile`. */
export async function startHub(options: StartHubOptions = {}): Promise<HubHandle> {
  if (!existsSync(BUNDLE)) execSync('npm run hub:compile', { cwd: ROOT, stdio: 'ignore' });
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dude-hub-int-'));
  let child: ChildProcess | undefined;
  let output = '';
  let port = 0;
  const baseEnv = { ...process.env, DUDE_HUB_TEST_RELAX_RATE_LIMITS: '1' };

  const spawnHub = async (requestedPort: number, env: Record<string, string>): Promise<void> => {
    const proc = spawn(process.execPath, [BUNDLE, 'run', '--data-dir', dir, '--port', String(requestedPort)], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...baseEnv, ...env } });
    child = proc;
    proc.stderr?.on('data', (c: Buffer) => { output += c.toString('utf8'); });
    let buffered = '';
    port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Hub did not start. Output: ${output}`)), 30_000);
      const onExit = (code: number | null): void => { clearTimeout(timer); reject(new Error(`Hub exited early (${code}). Output: ${output}`)); };
      proc.on('exit', onExit);
      proc.stdout?.on('data', (chunk: Buffer) => {
        buffered += chunk.toString('utf8');
        output += chunk.toString('utf8');
        for (const line of buffered.split('\n')) {
          try {
            const parsed = JSON.parse(line) as { event?: string; url?: string };
            if (parsed.event === 'listening' && parsed.url) { clearTimeout(timer); proc.off('exit', onExit); resolve(Number(new URL(parsed.url).port)); }
          } catch { /* not the listening line */ }
        }
      });
    });
  };

  const stop = async (): Promise<void> => {
    const proc = child;
    if (proc && proc.exitCode === null) {
      const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
      proc.kill();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    }
  };

  await spawnHub(0, options.env ?? {});
  const cert = (): string => readFileSync(path.join(dir, 'config', 'tls', 'cert.pem'), 'utf8');
  const request: HubHandle['request'] = (method, requestPath, body, headers = {}) => {
    const pem = cert();
    const tls = pinnedTlsOptions({ host: '127.0.0.1', port, ca: [pem], pins: [spkiSha256Of(pem)] });
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
      const req = https.request({ host: '127.0.0.1', port, method, path: requestPath, agent: false, headers: { ...(payload ? { 'content-type': 'application/json' } : {}), ...headers }, ...tls }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} });
        });
      });
      req.on('error', reject);
      req.end(payload);
    });
  };
  const ownerHeaders: HubHandle['ownerHeaders'] = async (password) => {
    const signIn = await request('POST', '/api/v1/auth/sign-in', { password });
    if (signIn.status !== 200) throw new Error(`owner sign-in failed (${signIn.status})`);
    return { cookie: String((signIn.headers['set-cookie'] as string[])[0]).split(';')[0]!, origin: `https://127.0.0.1:${port}`, 'x-dude-csrf': String(signIn.body['csrfToken']) };
  };

  const handle: HubHandle = {
    dir,
    get port() { return port; },
    cert,
    request,
    ownerHeaders,
    async pairingString(password) {
      const headers = await ownerHeaders(password);
      const code = await request('POST', '/api/v1/pairing-codes', { host: '127.0.0.1' }, headers);
      if (code.status !== 200) throw new Error(`pairing code failed (${code.status})`);
      return String(code.body['pairingString']);
    },
    cli: (...args) => execFileSync(process.execPath, [BUNDLE, ...args, '--data-dir', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 }),
    stop,
    async restart(env = {}) {
      await stop();
      // Reuse the port so enrolled agents (which pin host and port) reconnect on their own.
      await spawnHub(port, env);
    },
    async dispose() {
      await stop();
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
    output: () => output,
  };

  if (options.bootstrap) {
    const pem = cert();
    const api = createHubClient(createPinnedTransport({ host: '127.0.0.1', port, ca: [pem], pins: [spkiSha256Of(pem)] }), { clientProtocol: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL });
    const setupToken = readFileSync(path.join(dir, 'config', 'setup-token'), 'utf8').trim();
    await api.bootstrap({ setupToken, ownerDisplayName: 'Owner', environmentName: 'Test environment', password: options.bootstrap.password });
  }
  return handle;
}

export interface Agent {
  store: DeviceStore;
  hub: HubRuntime;
  sync: SyncRuntime;
  dir: string;
  rpc: <M extends AgentMethod>(method: M, params: AgentMethodMap[M]['params']) => Promise<AgentMethodMap[M]['result']>;
  /** Stops background work and closes the store without any clean-shutdown step (a process kill as far as the store can tell). */
  kill(): void;
}

export interface StartAgentOptions {
  /** Reuse an existing store directory (restart). */
  dir?: string;
  createTransport?: HubRuntimeDeps['createTransport'];
}

let nextRpcId = 1;
const agents = new Set<Agent>();

/** A real store + Hub runtime + sync runtime + RPC server, wired like `agent.ts` with fast test intervals. */
export function startAgent(dpapi: DpapiPort, options: StartAgentOptions = {}): Agent {
  const dir = options.dir ?? tempDir();
  const store = openReady(dir, { capabilities: CAPABILITIES });
  const now = (): Date => new Date();
  const hub = createHubRuntime({
    db: store.db, dpapi, now, timings: { backoffMinMs: 200, backoffMaxMs: 1_000, rateLimitBackoffMs: 7_000 },
    device: () => readDeviceRecord(store.db, CAPABILITIES),
    ...(options.createTransport ? { createTransport: options.createTransport } : {}),
  });
  const sync = createSyncRuntime({
    db: store.db, manager: hub.manager, now, newOpId: () => uuidv7((n) => new Uint8Array(randomBytes(n)), () => Date.now()),
    backupDir: path.join(dir, 'backups'),
    intervals: { debounceMs: 50, pollMs: 3_000, backoffMinMs: 200, backoffMaxMs: 1_000, reportMinIntervalMs: 1_000 },
  });
  // Like `agent.ts`: a store that already has an enrollment reconnects at start.
  if (getEnrollment(store.db)) hub.manager.start();
  sync.start();
  const server: RpcServer = createRpcServer(store, { now, randomBytes: (n) => new Uint8Array(randomBytes(n)), hub, sync });
  const agent: Agent = {
    store, hub, sync, dir,
    async rpc(method, params) {
      const response = await server.handle({ id: nextRpcId++, method, params });
      if (!response.ok) throw Object.assign(new Error(response.error.message), { code: response.error.code });
      return response.result as never;
    },
    kill() {
      agents.delete(agent);
      sync.stop();
      hub.manager.stop();
      try { store.close(); } catch { /* already closed */ }
    },
  };
  agents.add(agent);
  return agent;
}

/** Stops every started agent's background work (the stores are closed by `cleanupTemp`). */
export function stopAgents(): void {
  for (const agent of agents) { agent.sync.stop(); agent.hub.manager.stop(); }
  agents.clear();
}
