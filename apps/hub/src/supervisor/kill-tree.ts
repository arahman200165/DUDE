import { spawnSync } from 'node:child_process';

/** True while a process with this id exists (EPERM means it exists but is not ours to signal). */
export function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** Kills a process and, on Windows, the processes it started (`taskkill /T /F`). Synchronous and best effort: it is also the exit-handler path. */
export function killPidTree(pid: number): void {
  if (process.platform === 'win32') {
    try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 }); } catch { /* fall back to kill() */ }
  }
  try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
}
