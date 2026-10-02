import { app, MessageChannelMain, safeStorage, utilityProcess } from 'electron';
import { join } from 'node:path';
import type { AgentMethod, AgentMethodMap, AgentRequest, StoreHealth, StoreStatus } from '@dude/contracts';
import type { DeviceCapabilities, DevicePlatform } from '@dude/persistence';

/**
 * Main-process owner of the Device State Store utility process (Phase 31B, M620). It forks the
 * state service, hands the child one end of a private MessageChannel (the renderer never sees a
 * port), correlates requests by id, and applies a crash/backoff policy. Only the broker modules in
 * this folder talk to it.
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
  /** Manual retry: when unavailable, clears the crash history and restarts the child. Resolves once that attempt settles. */
  retry(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface HostPort {
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
}
export interface HostChild {
  postMessage(message: unknown, transfer?: unknown[]): void;
  once(event: 'exit', listener: (code: number) => void): void;
  kill(): boolean;
}
export type ForkFn = (path: string, args: string[], options: { serviceName: string; stdio: 'inherit' | 'pipe' }) => HostChild;
export type ChannelFn = () => { port1: HostPort; port2: unknown };

export interface StartOptions {
  userDataDir: string;
  appInfo: AppInfoConfig;
  capabilities: DeviceCapabilities;
  machineGuid?: string | null;
  /** Test seams. */
  fork?: ForkFn;
  createChannel?: ChannelFn;
  now?: () => number;
  agentPath?: string;
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

/** `device-agent.js` sits beside `main.js` in `dist/electron` in dev and inside the asar when packaged. */
export function agentScriptPath(): string {
  return join(__dirname, 'device-agent.js');
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
  private child: HostChild | null = null;
  private port: HostPort | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private queue: Queued[] = [];
  private crashes: number[] = [];
  private readonly listeners = new Set<(health: StoreHealth) => void>();
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private firstSettled: (() => void) | null = null;
  private readonly fork: ForkFn;
  private readonly createChannel: ChannelFn;
  private readonly now: () => number;
  private readonly agentPath: string;
  private exitWaiters: Array<() => void> = [];

  constructor(private readonly opts: StartOptions) {
    this.fork = opts.fork ?? ((path, args, options) => utilityProcess.fork(path, args, options) as unknown as HostChild);
    this.createChannel = opts.createChannel ?? (() => { const c = new MessageChannelMain(); return { port1: c.port1 as unknown as HostPort, port2: c.port2 }; });
    this.now = opts.now ?? Date.now;
    this.agentPath = opts.agentPath ?? agentScriptPath();
  }

  /** Resolves once the first spawn is ready or has failed; never rejects. */
  start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.firstSettled = resolve;
      this.spawn();
    });
  }

  private settleFirst(): void {
    const settle = this.firstSettled;
    this.firstSettled = null;
    settle?.();
  }

  private spawn(): void {
    this.phase = this.crashes.length === 0 ? 'starting' : 'restarting';
    let child: HostChild;
    let channel: ReturnType<ChannelFn>;
    try {
      child = this.fork(this.agentPath, [], { serviceName: 'DUDE Device Store', stdio: 'inherit' });
      channel = this.createChannel();
    } catch {
      this.registerCrash();
      return;
    }
    this.child = child;
    const port = channel.port1;
    this.port = port;
    port.on('message', (event) => { if (this.child === child) this.onMessage(event.data); });
    port.start();
    child.once('exit', () => this.onExit(child));
    // The second port is transferred to the child only; the host keeps port1.
    child.postMessage({
      config: { dir: join(this.opts.userDataDir, 'device-store'), machineGuid: this.opts.machineGuid ?? null, appInfo: this.opts.appInfo, capabilities: this.opts.capabilities },
    }, [channel.port2]);
    this.readyTimer = setTimeout(() => { this.readyTimer = null; if (this.phase !== 'running') child.kill(); }, READY_TIMEOUT_MS);
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

  private onExit(child: HostChild): void {
    if (this.child !== child) return;
    this.child = null;
    try { this.port?.close(); } catch { /* already closed */ }
    this.port = null;
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
    this.restartTimer = setTimeout(() => { this.restartTimer = null; if (this.phase === 'restarting') this.spawn(); }, delay);
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
    this.port?.postMessage(request);
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
      this.spawn();
    });
  }

  async shutdown(): Promise<void> {
    const wasRunning = this.phase === 'running';
    const child = this.child;
    this.phase = 'stopped';
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null; }
    this.rejectQueue('unavailable', 'The device store is shutting down.');
    if (!child) return;
    const exited = new Promise<void>((resolve) => { this.exitWaiters.push(resolve); });
    if (wasRunning) {
      await this.enqueue('store.shutdown', {}, SHUTDOWN_EXIT_CAP_MS, true).catch(() => undefined);
    }
    let cap: ReturnType<typeof setTimeout> | undefined;
    const capped = new Promise<void>((resolve) => { cap = setTimeout(resolve, SHUTDOWN_EXIT_CAP_MS); });
    await Promise.race([exited, capped]);
    clearTimeout(cap);
    if (this.child === child) { try { child.kill(); } catch { /* already gone */ } }
  }
}

/** Forks the state service and waits (bounded) for its first ready or failure; the host is returned either way. */
export async function startDeviceAgent(opts: StartOptions): Promise<DeviceStoreHost> {
  const host = new AgentHost(opts);
  await host.start();
  return host;
}
