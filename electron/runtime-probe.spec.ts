import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { runProbes, type ProbeSpawner } from './runtime-probe';

function fakeChild(script: (child: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void }) => void) {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() });
  queueMicrotask(() => script(child));
  return child as never;
}

const NODE = process.execPath;

describe('runProbes', () => {
  it('runs a valid version command and captures stdout and stderr', async () => {
    const spawner = vi.fn(() => fakeChild((c) => { c.stdout.emit('data', Buffer.from('v1.2.3\n')); c.stderr.emit('data', Buffer.from('warn')); c.emit('close', 0); })) as unknown as ProbeSpawner;
    const [r] = await runProbes([{ id: 'node', exe: NODE, args: ['--version'] }], spawner);
    expect(r).toEqual({ id: 'node', ok: true, stdout: 'v1.2.3\n', stderr: 'warn', exitCode: 0 });
    expect(spawner).toHaveBeenCalledWith(NODE, ['--version'], expect.objectContaining({ shell: false, windowsHide: true }));
  });

  it('runs a real executable', async () => {
    const [r] = await runProbes([{ id: 'node', exe: NODE, args: ['--version'] }]);
    expect(r.ok).toBe(true);
    expect(r.stdout).toMatch(/^v\d+\./);
  });

  it('reports a missing executable without spawning', async () => {
    const spawner = vi.fn() as unknown as ProbeSpawner;
    const [r] = await runProbes([{ id: 'bad', exe: 'C:\\definitely\\nope.exe', args: ['--version'] }], spawner);
    expect(r).toMatchObject({ id: 'bad', ok: false, error: 'Executable not found.' });
    expect(spawner).not.toHaveBeenCalled();
  });

  it('rejects a directory and a relative path without spawning', async () => {
    const spawner = vi.fn() as unknown as ProbeSpawner;
    const results = await runProbes([
      { id: 'dir', exe: 'C:\\Windows', args: ['--version'] },
      { id: 'rel', exe: 'node.exe', args: ['--version'] },
    ], spawner);
    expect(results.map((r) => r.ok)).toEqual([false, false]);
    expect(spawner).not.toHaveBeenCalled();
  });

  it('rejects disallowed arguments without spawning', async () => {
    const spawner = vi.fn() as unknown as ProbeSpawner;
    const results = await runProbes(['-e', 'console.log(1)', '; rm', '--version;x', '/c', '-1'].map((arg, i) => ({ id: `e${i}`, exe: NODE, args: [arg] })), spawner);
    expect(results.every((r) => !r.ok && r.error === 'Only version flags are allowed.')).toBe(true);
    expect(spawner).not.toHaveBeenCalled();
  });

  it('rejects malformed commands and too many args without spawning', async () => {
    const spawner = vi.fn() as unknown as ProbeSpawner;
    const results = await runProbes([
      { id: 'extra', exe: NODE, args: ['--version'], cwd: 'C:\\' },
      { id: 'many', exe: NODE, args: ['-a', '-b', '-c', '-d', '-e', '-f', '-g'] },
      'nope',
    ], spawner);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(spawner).not.toHaveBeenCalled();
  });

  it('caps the command count at 64', async () => {
    const spawner = vi.fn() as unknown as ProbeSpawner;
    const many = Array.from({ length: 65 }, (_, i) => ({ id: `n${i}`, exe: NODE, args: ['--version'] }));
    expect(await runProbes(many, spawner)).toEqual([]);
    expect(await runProbes([], spawner)).toEqual([]);
    expect(await runProbes('x', spawner)).toEqual([]);
    expect(spawner).not.toHaveBeenCalled();
  });

  it('kills and reports a command that hangs', async () => {
    let killed = false;
    const spawner = vi.fn(() => { const c = fakeChild(() => undefined) as unknown as { kill: () => void }; c.kill = () => { killed = true; }; return c; }) as unknown as ProbeSpawner;
    const [r] = await runProbes([{ id: 'hang', exe: NODE, args: ['--version'] }], spawner, 30);
    expect(r).toMatchObject({ id: 'hang', ok: false, error: 'Timed out.', exitCode: null });
    expect(killed).toBe(true);
  });

  it('caps captured output', async () => {
    const spawner = (() => fakeChild((c) => { c.stdout.emit('data', Buffer.alloc(200_000, 'a')); c.emit('close', 1); })) as unknown as ProbeSpawner;
    const [r] = await runProbes([{ id: 'big', exe: NODE, args: ['-v'] }], spawner);
    expect(r.stdout.length).toBe(64 * 1024);
    expect(r).toMatchObject({ ok: true, exitCode: 1 });
  });
});
