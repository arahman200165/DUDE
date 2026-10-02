import { app, safeStorage } from 'electron';
import { join } from 'node:path';
import type { AgentMethod, AgentMethodMap, AgentRequest, StoreHealth, StoreStatus } from '@dude/contracts';
import type { DeviceCapabilities, DevicePlatform } from '@dude/persistence';
import { createPipeTransport, resolveAgentLaunch } from './agent-transport';
import type { AgentConnection, AgentTransport } from './agent-transport';

/**
 * Main-process owner of the connection to the Device Agent (Phase 31B M620, rebuilt for 31C PD-026).
 * The agent is a separate Node process serving a per-user named pipe; this host connects through an
 * `AgentTransport` (spawning the agent when nothing listens), correlates requests by id and applies
 * a crash/backoff policy where a disconnect is treated as the agent exiting. The renderer never sees
 * the pipe. Only the broker modules in this folder talk to it.
 */

export interface AppInfoConfig { appVersion: string; platform: DevicePlatform; os: string; arch: string }

export class DeviceStoreError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'DeviceStoreError'; }
}

export interface CallOptions { timeoutMs?: number }

/** What the rest of main depends on; implemented by the real host and by in-process test clients. */
export interface DeviceStoreHost {
  call<M extends AgentMethod>(method: M, params: AgentMethodMap[M]['params'], options?: CallOptions): Promise<AgentMethodMap[M]['result']>;
  status(): StoreStatus;
  health(): StoreHealth | null;
  onHealth(listener: (health: StoreHealth) => void): () => void;
  /** Manual retry: when unavailable, clears the crash history and restarts the agent connection. Resolves once that attempt settles. */
  retry(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface StartOptions {
  userDataDir: string;
  appInfo: AppInfoConfig;
  capabilities: DeviceCapabilities;
  machineGuid?: string | null;
  /** Test seams. */
  transport?: AgentTransport;
  now?: () => number;
}

export const READY_TIMEOUT_MS = 10_000;
export const SHUTDOWN_EXIT_CAP_MS = 3_000;
export const RESTART_BACKOFF_MS = [500, 2_000, 8_000] as const;
export const CRASH_WINDOW_MS = 2 * 60_000;
export const MAX_CRASHES_IN_WINDOW = 3;
const DEFAULT_CALL_TIMEOUT_MS = 10_000;

type Phase = 'starting' | 'running' | 'restarting' | 'unavailable' | 'stopped';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: DeviceStoreError) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface Queued extends Pending { request: { method: AgentMethod; params: unknown }; id: number }

/** The device-store directory (`<userData>/device-store`); it names the agent's pipe and holds its key. */
export function deviceStoreDir(userDataDir: string): string {
  return join(userDataDir, 'device-store');
}

function productionTransport(opts: StartOptions): AgentTransport {
  const storeDir = deviceStoreDir(opts.userDataDir);
  return createPipeTransport({
    storeDir,
    // Unpackaged, `app.getVersion()` is not the build's version (it can be Electron's), and the agent is the sibling bundle anyway.
    appVersion: app.isPackaged ? opts.appInfo.appVersion : null,
    readyTimeoutMs: READY_TIMEOUT_MS,
    shutdownCapMs: SHUTDOWN_EXIT_CAP_MS,
    launch: () => resolveAgentLaunch({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, execPath: process.execPath, scriptDir: __dirname, platform: process.platform }, storeDir),
  });
}

export function deviceCapabilities(): DeviceCapabilities {
  let secureStorage = false;
  try { secureStorage = safeStorage.isEncryptionAvailable(); } catch { /* not available before ready on some hosts */ }
  return { desktop: true, filesystem: true, processes: process.platform === 'win32', secureStorage };
}

export function currentAppInfo(): AppInfoConfig {
  const platform: DevicePlatform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'unknown';
  return { appVersion: app.getVersion(), platform, os: process.getSystemVersion?.() ?? process.platform, arch: process.arch };
}

function syntheticHealth(status: StoreStatus, message: string): StoreHealth {
  return {
    status, schemaVersion: 0, minReaderVersion: 0, sizeBytes: 0,
    outbox: { pending: 0, maxRows: 0, backpressure: false }, legacyImport: 'none', message,
  };
}

class AgentHost implements DeviceStoreHost {
  private phase: Phase = 'starting';
  private reported: StoreStatus = 'degraded';
  private lastHealth: StoreHealth | null = null;
  private conn: AgentConnection | null = null;
  /** Bumped for every connect attempt and whenever one is abandoned, so a late result can be told apart. */
  private attempt = 0;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private queue: Queued[] = [];
  private crashes: number[] = [];
  private readonly listeners = new Set<(health: StoreHealth) => void>();
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private firstSettled: (() => void) | null = null;
  private readonly transport: AgentTransport;
  private readonly now: () => number;
  private exitWaiters: Array<() => void> = [];

  constructor(private readonly opts: StartOptions) {
    this.transport = opts.transport ?? productionTransport(opts);
    this.now = opts.now ?? Date.now;
  }

  /** Resolves once the first spawn is ready or has failed; never rejects. */
  start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.firstSettled = resolve;
      this.launch();
    });
  }

  private settleFirst(): void {
    const settle = this.firstSettled;
    this.firstSettled = null;
    settle?.();
  }

  private launch(): void {
    this.phase = this.crashes.length === 0 ? 'starting' : 'restarting';
    const attempt = ++this.attempt;
    let connecting: Promise<AgentConnection>;
    try {
      connecting = this.transport.connect({
        appInfo: this.opts.appInfo, capabilities: this.opts.capabilities, machineGuid: this.opts.machineGuid ?? null,
      });
    } catch {
      this.registerCrash();
      return;
    }
    // A connection that is not ready in time is abandoned (the transport's own timeouts normally fire first).
    this.readyTimer = setTimeout(() => {
      this.readyTimer = null;
      if (this.phase === 'running' || this.attempt !== attempt) return;
      this.attempt++;
      this.registerCrash();
    }, READY_TIMEOUT_MS);
    connecting.then((conn) => {
      if (this.attempt !== attempt || this.phase === 'stopped') { conn.close(); return; }
      this.conn = conn;
      conn.onMessage((message) => { if (this.conn === conn) this.onMessage(message); });
      conn.onClose(() => this.onExit(conn));
      // The agent's boot payload is the same `ready` event the utility process used to post.
      this.onMessage(conn.boot);
    }, () => {
      if (this.attempt !== attempt) return;
      this.attempt++;
      if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null; }
      this.registerCrash();
    });
  }

  private onMessage(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const message = data as Record<string, unknown>;
    if (message['type'] === 'ready') {
      if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null; }
      const status = message['status'];
      if (status === 'ready') {
        this.reported = 'ready';
        this.lastHealth = message['health'] as StoreHealth;
      } else {
        this.reported = status === 'corrupt' ? 'corrupt' : 'incompatible';
        this.lastHealth = syntheticHealth(this.reported, String(message['message'] ?? ''));
      }
      this.phase = 'running';
      this.emit();
      this.flushQueue();
      this.settleFirst();
      return;
    }
    if (typeof message['id'] !== 'number') return;
    const entry = this.pending.get(message['id']);
    if (!entry) return;
    this.pending.delete(message['id']);
    clearTimeout(entry.timer);
    if (message['ok'] === true) entry.resolve(message['result']);
    else {
      const error = (message['error'] ?? {}) as { code?: string; message?: string };
      entry.reject(new DeviceStoreError(error.code ?? 'internal', error.message ?? 'Request failed.'));
    }
  }

  private onExit(conn: AgentConnection): void {
    if (this.conn !== conn) return;
    this.conn = null;
    if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null; }
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new DeviceStoreError('agent-exited', 'The device store process exited.'));
      this.pending.delete(id);
    }
    const waiters = this.exitWaiters;
    this.exitWaiters = [];
    for (const w of waiters) w();
    if (this.phase === 'stopped') return;
    this.registerCrash();
  }

  private registerCrash(): void {
    const at = this.now();
    this.crashes = this.crashes.filter((t) => at - t < CRASH_WINDOW_MS);
    this.crashes.push(at);
    if (this.crashes.length > MAX_CRASHES_IN_WINDOW) {
      this.phase = 'unavailable';
      this.reported = 'unavailable';
      this.lastHealth = syntheticHealth('unavailable', 'The device store stopped repeatedly and was not restarted.');
      this.rejectQueue('unavailable', 'The device store is unavailable.');
      this.emit();
      this.settleFirst();
      return;
    }
    this.phase = 'restarting';
    this.reported = 'degraded';
    this.lastHealth = syntheticHealth('degraded', 'The device store is restarting.');
    this.emit();
    this.settleFirst();
    const delay = RESTART_BACKOFF_MS[Math.min(this.crashes.length, RESTART_BACKOFF_MS.length) - 1];
    this.restartTimer = setTimeout(() => { this.restartTimer = null; if (this.phase === 'restarting') this.launch(); }, delay);
  }

  private emit(): void {
    if (!this.lastHealth) return;
    for (const listener of this.listeners) {
      try { listener(this.lastHealth); } catch { /* a listener must not break the host */ }
    }
  }

  private rejectQueue(code: string, message: string): void {
    const queued = this.queue;
    this.queue = [];
    for (const q of queued) { clearTimeout(q.timer); q.reject(new DeviceStoreError(code, message)); }
  }

  private send(id: number, method: AgentMethod, params: unknown): void {
    const request: AgentRequest = { id, method, params: params as never };
    this.conn?.post(request);
  }

  private flushQueue(): void {
    const queued = this.queue;
    this.queue = [];
    for (const q of queued) {
      this.pending.set(q.id, q);
      this.send(q.id, q.request.method, q.request.params);
    }
  }

  call<M extends AgentMethod>(method: M, params: AgentMethodMap[M]['params'], options: CallOptions = {}): Promise<AgentMethodMap[M]['result']> {
    if (this.phase === 'unavailable' || this.phase === 'stopped') {
      return Promise.reject(new DeviceStoreError('unavailable', 'The device store is unavailable.'));
    }
    return this.enqueue(method, params, options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS, this.phase === 'running') as Promise<AgentMethodMap[M]['result']>;
  }

  private enqueue(method: AgentMethod, params: unknown, timeoutMs: number, immediate: boolean): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.queue = this.queue.filter((q) => q.id !== id);
        reject(new DeviceStoreError('timeout', `${method} timed out.`));
      }, timeoutMs);
      const entry: Pending = { resolve, reject, timer };
      if (immediate) {
        this.pending.set(id, entry);
        this.send(id, method, params);
      } else {
        this.queue.push({ ...entry, request: { method, params }, id });
      }
    });
  }

  status(): StoreStatus {
    if (this.phase === 'unavailable' || this.phase === 'stopped') return 'unavailable';
    if (this.phase === 'running') return this.reported;
    return 'degraded';
  }

  health(): StoreHealth | null { return this.lastHealth; }

  onHealth(listener: (health: StoreHealth) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  retry(): Promise<void> {
    if (this.phase !== 'unavailable') return Promise.resolve();
    this.crashes = [];
    this.lastHealth = syntheticHealth('degraded', 'The device store is restarting.');
    this.reported = 'degraded';
    this.emit();
    return new Promise<void>((resolve) => {
      this.firstSettled = resolve;
      this.launch();
    });
  }

  async shutdown(): Promise<void> {
    const wasRunning = this.phase === 'running';
    const conn = this.conn;
    this.attempt++;
    this.phase = 'stopped';
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null; }
    this.rejectQueue('unavailable', 'The device store is shutting down.');
    if (!conn) return;
    const exited = new Promise<void>((resolve) => { this.exitWaiters.push(resolve); });
    if (wasRunning) {
      await this.enqueue('store.shutdown', {}, SHUTDOWN_EXIT_CAP_MS, true).catch(() => undefined);
    }
    let cap: ReturnType<typeof setTimeout> | undefined;
    const capped = new Promise<void>((resolve) => { cap = setTimeout(resolve, SHUTDOWN_EXIT_CAP_MS); });
    await Promise.race([exited, capped]);
    clearTimeout(cap);
    if (this.conn === conn) { try { conn.close(); } catch { /* already gone */ } }
  }
}

/** Connects to (spawning if needed) the Device Agent and waits (bounded) for its first ready or failure; the host is returned either way. */
export async function startDeviceAgent(opts: StartOptions): Promise<DeviceStoreHost> {
  const host = new AgentHost(opts);
  await host.start();
  return host;
}
