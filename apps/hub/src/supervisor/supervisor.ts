import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { killPidTree, pidAlive } from './kill-tree.js';
import { createLogBuffer } from './log-buffer.js';
import type { LogBufferOptions, LogLine } from './log-buffer.js';
import { defaultProcessImagePath, sameImagePath } from './process-image.js';
import type { ProcessImagePath } from './process-image.js';
import { createRedactor } from './redact.js';

/** Restart delays after the 1st, 2nd and 3rd crash in a window: the same policy as the desktop Device Agent host (`agent-host.ts`). */
export const SUPERVISOR_BACKOFF_MS = [500, 2_000, 8_000] as const;
export const SUPERVISOR_CRASH_WINDOW_MS = 2 * 60_000;
/** More than this many crashes inside the window ends in `failed`; only an explicit `start()` tries again. */
export const SUPERVISOR_MAX_CRASHES_IN_WINDOW = 3;

export type SupervisorState = 'stopped' | 'starting' | 'running' | 'restarting' | 'failed';

/** Everything one launch needs, produced fresh by `prepare()` before EVERY spawn (so secrets are re-read and pins re-verified). */
export interface PreparedCommand {
  command: string;
  args: readonly string[];
  cwd?: string;
  /** The complete child environment: nothing is inherited. Secret values go here, never in `args`. */
  env: Readonly<Record<string, string>>;
  /** Secret values to scrub from captured output (the connector-token pattern is always scrubbed too). */
  secrets?: readonly string[];
  /** Readiness probe for this launch; absent means the child counts as running once it has spawned. */
  ready?: () => Promise<boolean>;
}

export interface SupervisorReadinessOptions {
  /** Poll interval. Default 1000. */
  intervalMs?: number;
  /** A launch that is not ready within this long is stopped and counted as a crash. Default 30 000. */
  startTimeoutMs?: number;
  /** Consecutive failed probes after being ready before `ready` turns false (no restart: the child may reconnect itself). Default 3. */
  unhealthyAfter?: number;
}

export interface SupervisorOptions {
  /** Short name used in diagnostics. */
  id: string;
  /** Builds the command for one launch; throwing refuses the launch (`failed`, no retry: the cause is not transient). */
  prepare: () => PreparedCommand | Promise<PreparedCommand>;
  backoffMs?: readonly number[];
  crashWindowMs?: number;
  maxCrashesInWindow?: number;
  readiness?: SupervisorReadinessOptions;
  /** How long a stopping child may take to exit after the polite signal before it is killed. Default 5000. */
  stopGraceMs?: number;
  /**
   * Where the running child's pid is recorded so a Hub that died without stopping it can be cleaned up by the next start. When set,
   * `expectedImagePath` (the executable the child runs) is required: an orphan is killed only if the process holding the recorded
   * pid really runs that image.
   */
  pidFile?: string;
  expectedImagePath?: string;
  log?: LogBufferOptions;
  /** Test seams. */
  now?: () => number;
  processImagePath?: ProcessImagePath;
}

export interface SupervisorExit { code: number | null; signal: string | null; at: number }

export interface SupervisorStatus {
  id: string;
  state: SupervisorState;
  /** Running and, when a probe exists, answering ready. */
  ready: boolean;
  pid: number | null;
  startedAt: number | null;
  /** How many times the child has been started again after a crash since the last `start()`. */
  restarts: number;
  crashesInWindow: number;
  lastExit: SupervisorExit | null;
  /** A short, credential-free code: `crashed-repeatedly`, `not-ready`, or the code of the error `prepare` threw. */
  lastError: string | null;
  nextRestartAt: number | null;
}

export interface Supervisor {
  /**
   * Starts the child from `stopped` or `failed` (clearing the crash history); a no-op while it is starting, running or
   * restarting. Sweeps an orphan recorded in the pid file first. Resolves once the process has been spawned (not once it is ready:
   * use `waitFor`), and rejects with the error `prepare` threw when the launch is refused (the state is then `failed`).
   */
  start(): Promise<void>;
  /** Stops the child for good: the polite signal, the grace period, then a tree kill; resolves once it has exited. */
  stop(): Promise<void>;
  restart(): Promise<void>;
  status(): SupervisorStatus;
  /** The bounded, redacted output of the child and the supervisor's own notes. */
  logs(): LogLine[];
  onChange(listener: (status: SupervisorStatus) => void): () => void;
  /** Resolves with the state once it is one of `states`; rejects after `timeoutMs`. */
  waitFor(states: readonly SupervisorState[], timeoutMs: number): Promise<SupervisorState>;
  /** Kills an orphan left by a previous Hub process (pid file plus image check). True when one was killed. Called by `start()`. */
  sweepOrphans(): Promise<boolean>;
  /** Synchronous last-resort kill for a process `exit` handler. */
  killNow(): void;
}

interface PidRecord { pid: number; startedAt: number }

export function createSupervisor(options: SupervisorOptions): Supervisor {
  if (options.pidFile !== undefined && options.expectedImagePath === undefined) throw new Error('A supervisor with a pid file needs expectedImagePath.');
  const backoff = options.backoffMs?.length ? options.backoffMs : SUPERVISOR_BACKOFF_MS;
  const crashWindowMs = options.crashWindowMs ?? SUPERVISOR_CRASH_WINDOW_MS;
  const maxCrashes = options.maxCrashesInWindow ?? SUPERVISOR_MAX_CRASHES_IN_WINDOW;
  const intervalMs = Math.max(5, options.readiness?.intervalMs ?? 1000);
  const startTimeoutMs = options.readiness?.startTimeoutMs ?? 30_000;
  const unhealthyAfter = Math.max(1, options.readiness?.unhealthyAfter ?? 3);
  const stopGraceMs = options.stopGraceMs ?? 5000;
  const now = options.now ?? Date.now;
  const imageOf = options.processImagePath ?? defaultProcessImagePath;
  const logs = createLogBuffer({ now, ...options.log });

  let state: SupervisorState = 'stopped';
  let ready = false;
  let child: ChildProcess | null = null;
  let startedAt: number | null = null;
  let restarts = 0;
  let crashes: number[] = [];
  let lastExit: SupervisorExit | null = null;
  let lastError: string | null = null;
  let nextRestartAt: number | null = null;
  let generation = 0;
  let halted = true;
  let restartTimer: NodeJS.Timeout | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let startTimer: NodeJS.Timeout | null = null;
  let starting: Promise<void> | null = null;
  let exitWaiters: Array<() => void> = [];
  const listeners = new Set<(status: SupervisorStatus) => void>();

  const snapshot = (): SupervisorStatus => ({
    id: options.id, state, ready: state === 'running' && ready, pid: child?.pid ?? null, startedAt, restarts,
    crashesInWindow: crashes.filter((at) => now() - at < crashWindowMs).length,
    lastExit: lastExit ? { ...lastExit } : null, lastError, nextRestartAt,
  });
  const emit = (): void => {
    const current = snapshot();
    for (const listener of listeners) {
      try { listener(current); } catch { /* a listener must not break the supervisor */ }
    }
  };
  const setState = (next: SupervisorState): void => { state = next; emit(); };

  const clearTimers = (): void => {
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (startTimer) { clearTimeout(startTimer); startTimer = null; }
    nextRestartAt = null;
  };

  const readPidRecord = (): PidRecord | null => {
    if (!options.pidFile) return null;
    try {
      const parsed = JSON.parse(readFileSync(options.pidFile, 'utf8')) as Partial<PidRecord>;
      return Number.isInteger(parsed.pid) && (parsed.pid ?? 0) > 0 ? { pid: parsed.pid as number, startedAt: Number(parsed.startedAt) || 0 } : null;
    } catch { return null; }
  };
  const writePidRecord = (pid: number): void => {
    if (!options.pidFile) return;
    try {
      mkdirSync(path.dirname(options.pidFile), { recursive: true });
      writeFileSync(options.pidFile, JSON.stringify({ pid, startedAt: now() } satisfies PidRecord), { mode: 0o600 });
    } catch { logs.note('The pid file could not be written; a crash of the Hub would leave this process for the next start to find by other means.'); }
  };
  const removePidRecord = (): void => { if (options.pidFile) rmSync(options.pidFile, { force: true }); };

  async function sweepOrphans(): Promise<boolean> {
    const record = readPidRecord();
    if (!options.pidFile) return false;
    if (!record) { removePidRecord(); return false; }
    if (record.pid === process.pid || record.pid === child?.pid || !pidAlive(record.pid)) { removePidRecord(); return false; }
    const image = await imageOf(record.pid);
    if (image === null || !sameImagePath(image, options.expectedImagePath ?? '')) {
      // A reused pid (or an unreadable one): never kill what we cannot prove is ours.
      removePidRecord();
      return false;
    }
    killPidTree(record.pid);
    for (let i = 0; i < 40 && pidAlive(record.pid); i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    removePidRecord();
    logs.note('A previous process left by an earlier Hub run was stopped.');
    return true;
  }

  const finishExits = (): void => {
    const waiters = exitWaiters;
    exitWaiters = [];
    for (const waiter of waiters) waiter();
  };

  function registerCrash(reason: string | null): void {
    const at = now();
    crashes = crashes.filter((t) => at - t < crashWindowMs);
    crashes.push(at);
    ready = false;
    if (crashes.length > maxCrashes) {
      lastError = 'crashed-repeatedly';
      logs.note(`Stopped repeatedly (${String(crashes.length)} times within ${String(Math.round(crashWindowMs / 1000))} s); not restarted.`);
      setState('failed');
      return;
    }
    if (reason) lastError = reason;
    const delay = backoff[Math.min(crashes.length, backoff.length) - 1] ?? backoff[backoff.length - 1] ?? 1000;
    nextRestartAt = at + delay;
    setState('restarting');
    restartTimer = setTimeout(() => {
      restartTimer = null;
      nextRestartAt = null;
      if (state !== 'restarting') return;
      restarts += 1;
      void launch().catch(() => undefined); // a refused launch has already put the state at `failed`
    }, delay);
  }

  function onExit(exited: ChildProcess, code: number | null, signal: string | null): void {
    if (child !== exited) return;
    child = null;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (startTimer) { clearTimeout(startTimer); startTimer = null; }
    removePidRecord();
    lastExit = { code, signal, at: now() };
    logs.note(`Exited (${signal ?? `code ${String(code ?? 'unknown')}`}).`);
    finishExits();
    if (halted) return;
    registerCrash(null);
  }

  async function launch(): Promise<void> {
    const mine = ++generation;
    ready = false;
    setState('starting');
    let prepared: PreparedCommand;
    try {
      prepared = await options.prepare();
    } catch (error) {
      if (mine === generation) {
        const code = (error as { code?: unknown }).code;
        lastError = typeof code === 'string' ? code : 'prepare-failed';
        logs.note(`Start refused (${lastError}).`);
        setState('failed');
      }
      throw error;
    }
    if (mine !== generation || halted) return;

    logs.setRedactor(createRedactor(prepared.secrets ?? []));
    let spawned: ChildProcess;
    try {
      spawned = spawn(prepared.command, [...prepared.args], {
        ...(prepared.cwd ? { cwd: prepared.cwd } : {}),
        env: { ...prepared.env },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      lastError = 'spawn-failed';
      registerCrash('spawn-failed');
      return;
    }
    child = spawned;
    startedAt = now();
    spawned.stdout?.setEncoding('utf8');
    spawned.stderr?.setEncoding('utf8');
    spawned.stdout?.on('data', (chunk: string) => logs.push('stdout', chunk));
    spawned.stderr?.on('data', (chunk: string) => logs.push('stderr', chunk));
    let errored = false;
    spawned.once('error', () => {
      // No 'close' follows a failed spawn.
      errored = true;
      lastError = 'spawn-failed';
      onExit(spawned, null, null);
    });
    spawned.once('close', (code, signal) => { if (!errored) onExit(spawned, code, signal); });
    spawned.once('spawn', () => {
      if (child !== spawned || mine !== generation) return;
      if (spawned.pid !== undefined) writePidRecord(spawned.pid);
      if (!prepared.ready) { ready = true; setState('running'); return; }
      emit();
      startTimer = setTimeout(() => {
        startTimer = null;
        if (child !== spawned || state !== 'starting') return;
        logs.note('Not ready in time; stopping it to start again.');
        lastError = 'not-ready';
        // Killing it makes `close` fire, which registers the crash and schedules the restart.
        if (spawned.pid !== undefined) killPidTree(spawned.pid);
      }, startTimeoutMs);
      let failures = 0;
      const probe = (): void => {
        pollTimer = null;
        if (child !== spawned || mine !== generation) return;
        const check = prepared.ready;
        void (check ? check() : Promise.resolve(false)).catch(() => false).then((ok) => {
          if (child !== spawned || mine !== generation) return;
          if (ok) {
            failures = 0;
            if (startTimer) { clearTimeout(startTimer); startTimer = null; }
            if (state !== 'running' || !ready) { ready = true; lastError = null; setState('running'); }
          } else if (state === 'running') {
            failures += 1;
            if (failures >= unhealthyAfter && ready) { ready = false; emit(); }
          }
          pollTimer = setTimeout(probe, intervalMs);
        });
      };
      probe();
    });
  }

  async function start(): Promise<void> {
    if (starting) return starting;
    if (state === 'starting' || state === 'running' || state === 'restarting') return;
    const run = (async () => {
      halted = false;
      crashes = [];
      restarts = 0;
      lastError = null;
      try {
        await sweepOrphans();
        if (halted) return;
        await launch();
      } catch (error) {
        halted = true;
        throw error;
      }
    })();
    starting = run.finally(() => { starting = null; });
    return starting;
  }

  async function stop(): Promise<void> {
    halted = true;
    generation += 1;
    clearTimers();
    if (starting) await starting.catch(() => undefined);
    const target = child;
    ready = false;
    if (state !== 'stopped') setState('stopped');
    if (!target) return;
    const exited = new Promise<void>((resolve) => { exitWaiters.push(resolve); });
    try { target.kill('SIGTERM'); } catch { /* already gone */ }
    const within = (ms: number): Promise<boolean> => new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      void exited.then(() => { clearTimeout(timer); resolve(true); });
    });
    if (!(await within(stopGraceMs))) {
      logs.note('Did not stop in time; killing it.');
      if (target.pid !== undefined) killPidTree(target.pid);
      await within(3000);
    }
    if (child === target) {
      // Streams that never closed: the process is gone, so stop waiting for 'close'.
      if (target.pid !== undefined && pidAlive(target.pid)) killPidTree(target.pid);
      child = null;
      removePidRecord();
      finishExits();
    }
  }

  return {
    start,
    stop,
    async restart() { await stop(); await start(); },
    status: snapshot,
    logs: () => logs.lines(),
    onChange(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    waitFor(states, timeoutMs) {
      return new Promise<SupervisorState>((resolve, reject) => {
        if (states.includes(state)) { resolve(state); return; }
        const timer = setTimeout(() => { off(); reject(new Error(`${options.id} did not reach ${states.join(' or ')} within ${String(timeoutMs)} ms (state: ${state}).`)); }, timeoutMs);
        const off = (): void => { clearTimeout(timer); listeners.delete(listener); };
        const listener = (status: SupervisorStatus): void => { if (states.includes(status.state)) { off(); resolve(status.state); } };
        listeners.add(listener);
      });
    },
    sweepOrphans,
    killNow() {
      halted = true;
      generation += 1;
      clearTimers();
      const pid = child?.pid;
      if (pid !== undefined) killPidTree(pid);
      removePidRecord();
    },
  };
}
