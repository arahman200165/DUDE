import { execFile } from 'node:child_process';
import { readlink } from 'node:fs/promises';
import path from 'node:path';

/** The executable path of a running process, or null when it is gone or cannot be read. */
export type ProcessImagePath = (pid: number) => Promise<string | null>;

/**
 * Windows has no Node API for another process's image path, so this asks CIM through PowerShell (a fixed script; the pid is an
 * integer we validated, never interpolated text from outside). It runs only when an orphan sweep finds a pid file, never on a
 * hot path. Linux reads `/proc/<pid>/exe`.
 */
export const defaultProcessImagePath: ProcessImagePath = async (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${String(pid)}").ExecutablePath`],
        { windowsHide: true, timeout: 15_000 },
        (error, stdout) => resolve(error ? null : stdout.trim() || null),
      );
    });
  }
  try { return await readlink(`/proc/${String(pid)}/exe`); } catch { return null; }
};

/** Case-insensitive on Windows, exact elsewhere; both sides are resolved first. */
export function sameImagePath(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}
