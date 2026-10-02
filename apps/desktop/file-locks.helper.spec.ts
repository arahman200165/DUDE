import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const helperPath = resolve('build/windows-sys.exe');
const runnable = process.platform === 'win32' && existsSync(helperPath);

/** One request/response round trip against the real helper (skipped when it is not built). */
function rpc(method: string, params: object): Promise<{ ok: boolean; result?: any; error?: string }> {
  return new Promise((ok, fail) => {
    const child = spawn(helperPath, [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes('\n')) { child.stdin.end(); ok(JSON.parse(buffer.split('\n')[0])); }
    });
    child.once('error', fail);
    child.stdin.write(JSON.stringify({ id: 1, method, params }) + '\n');
  });
}

describe.skipIf(!runnable)('file lock helper against a real holder process', () => {
  it('lock.rmList reports the holder PID; a graceful release is bounded and never force-closes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dude-lock-'));
    const held = join(dir, 'held.txt');
    await writeFile(held, 'locked fixture');
    // Restart Manager must address a fixture in its own process group, not the test runner's console.
    const holder: ChildProcess = spawn(process.execPath, [resolve('apps/desktop/__fixtures__/file-lock-holder.cjs'), held], { stdio: ['pipe', 'pipe', 'ignore'], detached: true, windowsHide: true });
    try {
      await new Promise<void>((ok, fail) => { holder.once('error', fail); holder.stdout!.once('data', () => ok()); });
      const listed = await rpc('lock.rmList', { path: held });
      expect(listed.ok).toBe(true);
      expect(listed.result.owners.map((o: { pid: number }) => o.pid)).toContain(holder.pid);
      const folder = await rpc('lock.rmList', { path: dir });
      expect(folder.result.owners.map((o: { pid: number }) => o.pid)).toContain(holder.pid);

      // Console processes have no window to answer RmShutdown, so RM typically reports ERROR_SEM_TIMEOUT (121) or
      // cancels; either way the helper must answer within its budget with a numeric status and list the holder.
      const started = Date.now();
      const released = await rpc('lock.rmRelease', { path: held, restartAfter: false });
      expect(Date.now() - started).toBeLessThan(14_000);
      expect(released.ok).toBe(true);
      expect(released.result.owners.map((o: { pid: number }) => o.pid)).toContain(holder.pid);
      expect(typeof released.result.shutdownStatus).toBe('number');
    } finally {
      holder.stdin!.end();
      holder.kill();
      await new Promise<void>((ok) => (holder.exitCode !== null ? ok() : holder.once('exit', () => ok())));
      await rm(dir, { recursive: true, force: true });
    }
  }, 40_000);
});
