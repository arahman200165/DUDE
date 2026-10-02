import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';

/**
 * Start the Device Agent at sign-in, per user, no administrator rights (Phase 31C, PD-026).
 *
 * Preferred mechanism: a per-user Task Scheduler task (`schtasks /SC ONLOGON /RL LIMITED`). Windows
 * refuses ONLOGON task creation to a standard (non-elevated) user with "Access is denied", so the
 * fallback is the per-user `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value
 * `DUDEDeviceAgent`, which needs no rights at all. Both are tried in that order and the one in use is
 * reported. Unpackaged/dev builds never install anything: their agent command is Electron running a
 * script as Node, not a stable executable.
 *
 * Every command runs through `execFile` with `shell: false` and `windowsHide`, and registry paths
 * keep real backslashes (a single-backslash string collapses the path).
 */

export type AutostartMechanism = 'task' | 'run-key';

export type AgentAutostartState =
  | { readonly status: 'enabled'; readonly mechanism: AutostartMechanism }
  | { readonly status: 'disabled' }
  | { readonly status: 'unsupported-in-dev' }
  | { readonly status: 'unsupported-platform' };

export type AutostartSetResult = { readonly ok: true; readonly state: AgentAutostartState } | { readonly ok: false; readonly error: string };

export interface ExecResult { readonly code: number; readonly stdout: string }
export type ExecFn = (file: string, args: readonly string[], options: { windowsHide: true; timeout: number; shell: false }) => Promise<ExecResult>;

export const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const RUN_VALUE = 'DUDEDeviceAgent';
const EXEC_TIMEOUT_MS = 10_000;

const defaultExec: ExecFn = (file, args, options) => new Promise((resolve) => {
  execFile(file, [...args], { ...options, encoding: 'utf8', maxBuffer: 256 * 1024 }, (error, stdout) => {
    const code = error ? (typeof (error as NodeJS.ErrnoException).code === 'number' ? ((error as NodeJS.ErrnoException).code as unknown as number) : -1) : 0;
    resolve({ code, stdout: String(stdout ?? '') });
  });
});

/** `"<agent exe>" --store-dir "<storeDir>"`: what both mechanisms run at sign-in. */
export function autostartCommand(agentExe: string, storeDir: string): string {
  return `"${agentExe}" --store-dir "${storeDir}"`;
}

/** `DUDE\Device Agent <hash of storeDir>`: one task per store directory. */
export function autostartTaskName(storeDir: string): string {
  const hash = createHash('sha256').update(storeDir.toLowerCase()).digest('hex').slice(0, 12);
  return `DUDE\\Device Agent ${hash}`;
}

export interface AgentAutostartOptions {
  storeDir: string;
  /** The packaged agent executable, or null for an unpackaged/dev build. */
  agentExe: string | null;
  exec?: ExecFn;
  platform?: NodeJS.Platform;
}

export interface AgentAutostart {
  get(): Promise<AgentAutostartState>;
  set(enabled: boolean): Promise<AutostartSetResult>;
}

export function createAgentAutostart(options: AgentAutostartOptions): AgentAutostart {
  const exec = options.exec ?? defaultExec;
  const platform = options.platform ?? process.platform;
  const taskName = autostartTaskName(options.storeDir);
  const run = (file: string, args: string[]): Promise<ExecResult> => exec(file, args, { shell: false, windowsHide: true, timeout: EXEC_TIMEOUT_MS });

  const unsupported = (): AgentAutostartState | null => {
    if (platform !== 'win32') return { status: 'unsupported-platform' };
    if (!options.agentExe) return { status: 'unsupported-in-dev' };
    return null;
  };

  const taskExists = async (): Promise<boolean> => (await run('schtasks.exe', ['/Query', '/TN', taskName])).code === 0;
  const runKeyExists = async (): Promise<boolean> => (await run('reg.exe', ['query', RUN_KEY, '/v', RUN_VALUE])).code === 0;
  const deleteTask = (): Promise<ExecResult> => run('schtasks.exe', ['/Delete', '/TN', taskName, '/F']);
  const deleteRunKey = (): Promise<ExecResult> => run('reg.exe', ['delete', RUN_KEY, '/v', RUN_VALUE, '/f']);

  async function get(): Promise<AgentAutostartState> {
    const blocked = unsupported();
    if (blocked) return blocked;
    if (await taskExists()) return { status: 'enabled', mechanism: 'task' };
    if (await runKeyExists()) return { status: 'enabled', mechanism: 'run-key' };
    return { status: 'disabled' };
  }

  async function set(enabled: boolean): Promise<AutostartSetResult> {
    const blocked = unsupported();
    if (blocked) return { ok: true, state: blocked };
    if (!enabled) {
      await deleteTask();
      await deleteRunKey();
      const state = await get();
      return state.status === 'disabled' ? { ok: true, state } : { ok: false, error: 'Could not remove the sign-in entry.' };
    }
    const command = autostartCommand(options.agentExe as string, options.storeDir);
    const created = await run('schtasks.exe', ['/Create', '/SC', 'ONLOGON', '/TN', taskName, '/TR', command, '/RL', 'LIMITED', '/F']);
    if (created.code === 0) {
      // A task supersedes any Run value left from an earlier fallback.
      await deleteRunKey();
      return { ok: true, state: { status: 'enabled', mechanism: 'task' } };
    }
    // Access denied (the usual answer for a standard user) or any other task failure: use the per-user Run key.
    const added = await run('reg.exe', ['add', RUN_KEY, '/v', RUN_VALUE, '/t', 'REG_SZ', '/d', command, '/f']);
    if (added.code === 0) return { ok: true, state: { status: 'enabled', mechanism: 'run-key' } };
    return { ok: false, error: 'Could not set DUDE to start at sign-in.' };
  }

  return { get, set };
}

let current: AgentAutostart | null = null;

/** Wires the module-level functions; main calls it once with the packaged agent path (or null when unpackaged). */
export function configureAgentAutostart(options: AgentAutostartOptions | null): void {
  current = options ? createAgentAutostart(options) : null;
}

export function getAgentAutostart(): Promise<AgentAutostartState> {
  return current ? current.get() : Promise.resolve({ status: 'unsupported-in-dev' });
}

export function setAgentAutostart(enabled: boolean): Promise<AutostartSetResult> {
  return current ? current.set(enabled) : Promise.resolve({ ok: true, state: { status: 'unsupported-in-dev' } });
}
