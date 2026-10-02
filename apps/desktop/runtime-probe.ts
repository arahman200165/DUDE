import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { statSync } from 'node:fs';
import { ipcMain } from 'electron';

/**
 * Runtime Installation Detector probe (Phase 31 M600): an explicit, user-initiated run of discovered
 * runtimes with version flags only. Absolute existing exe, allowlisted version-flag args, no shell.
 */
export interface ProbeCommand { readonly id: string; readonly exe: string; readonly args: readonly string[] }
export interface ProbeResult { readonly id: string; readonly ok: boolean; readonly stdout: string; readonly stderr: string; readonly exitCode: number | null; readonly error?: string }
export type ProbeSpawner = (file: string, args: string[], options: SpawnOptions) => ChildProcess;

const MAX_COMMANDS = 64;
const MAX_ARGS = 6;
const MAX_ID = 64;
const MAX_EXE = 32767;
const MAX_ARG = 64;
const CAP = 64 * 1024;
const CONCURRENCY = 8;
const TIMEOUT_MS = 5000;
const ARG_PATTERN = /^(?:--[A-Za-z][A-Za-z-]{0,30}|-[vV]|-version|version)$/;
const ABSOLUTE_WINDOWS = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(id: string, error: string): ProbeResult {
  return { id, ok: false, stdout: '', stderr: '', exitCode: null, error };
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function isFile(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

function runOne(spawner: ProbeSpawner, id: string, exe: string, args: string[], timeoutMs: number): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let stdout = '', stderr = '', settled = false, timedOut = false;
    let child: ChildProcess;
    const finish = (result: ProbeResult) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { timedOut = true; try { child?.kill(); } catch { /* already gone */ } finish(fail(id, 'Timed out.')); }, timeoutMs);
    try {
      child = spawner(exe, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      finish(fail(id, error instanceof Error ? error.message : 'Could not start.'));
      return;
    }
    child.stdout?.on('data', (data: Buffer) => { if (stdout.length < CAP) stdout = (stdout + data.toString('utf8')).slice(0, CAP); });
    child.stderr?.on('data', (data: Buffer) => { if (stderr.length < CAP) stderr = (stderr + data.toString('utf8')).slice(0, CAP); });
    child.once('error', (error: Error) => finish(fail(id, error.message)));
    child.once('close', (code: number | null) => {
      if (timedOut) return;
      finish({ id, ok: true, stdout, stderr, exitCode: code });
    });
  });
}

export async function runProbes(commands: unknown, spawner: ProbeSpawner = spawn, timeoutMs = TIMEOUT_MS): Promise<ProbeResult[]> {
  if (!Array.isArray(commands) || commands.length < 1 || commands.length > MAX_COMMANDS) return [];
  const results: ProbeResult[] = new Array(commands.length);
  const jobs: { index: number; id: string; exe: string; args: string[] }[] = [];

  commands.forEach((raw: unknown, index) => {
    const keys = isPlain(raw) ? Object.keys(raw).sort().join(',') : '';
    if (!isPlain(raw) || keys !== 'args,exe,id') { results[index] = fail(typeof (raw as { id?: unknown })?.id === 'string' ? String((raw as { id: string }).id).slice(0, MAX_ID) : '', 'Invalid probe command.'); return; }
    const { id, exe, args } = raw;
    if (typeof id !== 'string' || id.length > MAX_ID) { results[index] = fail('', 'Invalid probe command.'); return; }
    if (typeof exe !== 'string' || exe.length === 0 || exe.length > MAX_EXE || CONTROL.test(exe) || !ABSOLUTE_WINDOWS.test(exe)) { results[index] = fail(id, 'Executable not found.'); return; }
    if (!Array.isArray(args) || args.length > MAX_ARGS || !args.every((arg) => typeof arg === 'string' && arg.length <= MAX_ARG && ARG_PATTERN.test(arg))) {
      results[index] = fail(id, 'Only version flags are allowed.');
      return;
    }
    if (!isFile(exe)) { results[index] = fail(id, 'Executable not found.'); return; }
    jobs.push({ index, id, exe, args: [...args] as string[] });
  });

  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      results[job.index] = await runOne(spawner, job.id, job.exe, job.args, timeoutMs);
    }
  }));
  return results;
}

export function registerRuntimeProbeHandlers(): void {
  ipcMain.handle('dude:runtime:probe', async (_event, commands: unknown) => {
    try { return await runProbes(commands); } catch { return []; }
  });
}
