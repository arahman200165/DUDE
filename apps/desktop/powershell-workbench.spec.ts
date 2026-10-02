import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ app: { getPath: (): string => '' }, ipcMain: { handle: vi.fn() } }));
vi.mock('electron', () => electron);

import {
  bootstrapFor, cancelPowerShellRun, confirmPowerShellRun, discardPowerShellPreview, listPowerShellHistory, normalizeCatalog, previewPowerShellRun,
  resetPowerShellWorkbenchForTesting, setPowerShellWorkbenchDepsForTesting, settlePowerShellRunsForTesting, startPowerShellRun,
} from './powershell-workbench';

const directories: string[] = [];
function fakeWindow(id: number): Electron.WebContents {
  return Object.assign(new EventEmitter(), { id, isDestroyed: () => false, send: vi.fn() }) as unknown as Electron.WebContents;
}
const owner = fakeWindow(19);
function fakeChild(): any {
  const child = new EventEmitter() as any;
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.pid = 456; child.unref = vi.fn(); child.kill = vi.fn();
  return child;
}
function install(children: any[], extra: Record<string, unknown> = {}): void {
  setPowerShellWorkbenchDepsForTesting({
    status: async () => ({ available: true, path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', version: '7.6.6' }),
    elevated: async () => false,
    spawn: (() => { const child = fakeChild(); children.push(child); return child; }) as any,
    killTree: (child) => (child as any).kill(),
    ...extra,
  });
}

beforeEach(async () => {
  const userData = await mkdtemp(join(tmpdir(), 'dude-pwsh-workbench-'));
  directories.push(userData);
  electron.app.getPath = () => userData;
  electron.ipcMain.handle.mockReset();
  (owner.send as any).mockReset();
});
afterEach(async () => {
  await settlePowerShellRunsForTesting();
  resetPowerShellWorkbenchForTesting();
  setPowerShellWorkbenchDepsForTesting(null);
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  vi.useRealTimers();
});

describe('PowerShell workbench confirmation boundary', () => {
  it('requires a fresh token before spawning and consumes confirmation on the first attempt', async () => {
    const children: any[] = [];
    install(children, { appendHistory: async () => {} });
    const script = 'Get-Date'; // fixed harmless fixture; fake spawn captures input but never executes it.
    const preview = await previewPowerShellRun(owner, script, process.cwd());
    expect(preview).toMatchObject({ script, cwd: process.cwd(), elevated: false, warnings: [] });
    expect(preview.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(startPowerShellRun(owner, preview.previewId, undefined)).rejects.toThrow(/confirm/i);
    expect(children).toHaveLength(0);

    const { token } = confirmPowerShellRun(owner.id, preview.previewId);
    const started = await startPowerShellRun(owner, preview.previewId, token);
    expect(children).toHaveLength(1);
    let input = '';
    children[0].stdin.on('data', (chunk: Buffer) => { input += chunk.toString('utf8'); });
    await new Promise((resolve) => setImmediate(resolve));
    expect(input).toBe(bootstrapFor(script));
    expect(input).not.toContain(script); // transported as base64, never as command text
    await expect(startPowerShellRun(owner, preview.previewId, token)).rejects.toThrow(/confirm|expired/i);
    children[0].emit('close', 0);
    expect(started.runId).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('rejects a replayed token, a token for another preview digest, another window, an expired token and a discarded preview', async () => {
    const children: any[] = [];
    install(children, { appendHistory: async () => {} });
    const other = fakeWindow(20);
    const first = await previewPowerShellRun(owner, 'Get-Date', process.cwd());
    const second = await previewPowerShellRun(owner, 'Get-Date -Format o', process.cwd()); // the script was edited after the first preview
    expect(second.sha256).not.toBe(first.sha256);

    const forFirst = confirmPowerShellRun(owner.id, first.previewId).token;
    await expect(startPowerShellRun(owner, second.previewId, forFirst)).rejects.toThrow(/expired|changed/i);
    await expect(startPowerShellRun(owner, first.previewId, forFirst)).rejects.toThrow(/expired|changed/i); // consumed by the failed attempt
    expect(() => confirmPowerShellRun(other.id, first.previewId)).toThrow(/expired/i);
    const stolen = confirmPowerShellRun(owner.id, second.previewId).token;
    await expect(startPowerShellRun(other, second.previewId, stolen)).rejects.toThrow(/expired|changed/i);
    expect(discardPowerShellPreview(other.id, second.previewId)).toBe(false);
    expect(discardPowerShellPreview(owner.id, second.previewId)).toBe(true);
    expect(() => confirmPowerShellRun(owner.id, second.previewId)).toThrow(/expired/i);

    const third = await previewPowerShellRun(owner, 'Get-Date -Format u', process.cwd());
    vi.useFakeTimers({ toFake: ['Date'] });
    const late = confirmPowerShellRun(owner.id, third.previewId).token;
    vi.setSystemTime(Date.now() + 61_000);
    await expect(startPowerShellRun(owner, third.previewId, late)).rejects.toThrow(/expired/i);
    expect(children).toHaveLength(0);
  });

  it('validates the script, working directory and timeout before anything runs', async () => {
    const children: any[] = [];
    install(children);
    await expect(previewPowerShellRun(owner, '   ', process.cwd())).rejects.toThrow(/script/i);
    await expect(previewPowerShellRun(owner, 'Get-Date', 'relative')).rejects.toThrow(/absolute/i);
    await expect(previewPowerShellRun(owner, 'Get-Date', join(directories[0], 'missing'))).rejects.toThrow(/does not exist/i);
    const preview = await previewPowerShellRun(owner, 'Get-Date', process.cwd());
    const { token } = confirmPowerShellRun(owner.id, preview.previewId);
    await expect(startPowerShellRun(owner, preview.previewId, token, 10)).rejects.toThrow(/timeout/i);
    expect(children).toHaveLength(0);
  });

  it('surfaces static warnings in the preview without blocking it', async () => {
    install([]);
    const preview = await previewPowerShellRun(owner, 'Remove-Item C:\\x; iex $s', process.cwd());
    expect(preview.warnings.map((warning) => warning.code).sort()).toEqual(['code-eval', 'destructive-verb']);
  });

  it('streams output only to the owning window, reports the exit code and cancels only for the owner', async () => {
    const children: any[] = [];
    install(children);
    const preview = await previewPowerShellRun(owner, 'Get-Date', process.cwd());
    const { token } = confirmPowerShellRun(owner.id, preview.previewId);
    const { runId } = await startPowerShellRun(owner, preview.previewId, token);
    children[0].stdout.write('hello');
    children[0].stderr.write('oops');
    await new Promise((resolve) => setImmediate(resolve));
    expect(owner.send).toHaveBeenCalledWith('dude:powershell:event', { runId, stream: 'stdout', text: 'hello' });
    expect(owner.send).toHaveBeenCalledWith('dude:powershell:event', { runId, stream: 'stderr', text: 'oops' });
    expect(cancelPowerShellRun(20, runId)).toBe(false);
    expect(children[0].kill).not.toHaveBeenCalled();
    expect(cancelPowerShellRun(owner.id, runId)).toBe(true);
    expect(children[0].kill).toHaveBeenCalledTimes(1);
    children[0].emit('close', 1);
    await settlePowerShellRunsForTesting();
    expect(owner.send).toHaveBeenCalledWith('dude:powershell:event', expect.objectContaining({ runId, stream: 'complete', exitCode: 1, cancelled: true }));
  });

  it('cancels a running script when its window is destroyed', async () => {
    const children: any[] = [];
    install(children, { appendHistory: async () => {} });
    const window = fakeWindow(31);
    const preview = await previewPowerShellRun(window, 'Start-Sleep 60', process.cwd());
    const { token } = confirmPowerShellRun(window.id, preview.previewId);
    await startPowerShellRun(window, preview.previewId, token);
    (window as unknown as EventEmitter).emit('destroyed');
    expect(children[0].kill).toHaveBeenCalledTimes(1);
    children[0].emit('close', null);
  });

  it('persists metadata without script text or output', async () => {
    const children: any[] = [];
    install(children, { elevated: async () => true });
    const preview = await previewPowerShellRun(owner, 'Get-Date', process.cwd());
    const { token } = confirmPowerShellRun(owner.id, preview.previewId);
    const { runId } = await startPowerShellRun(owner, preview.previewId, token);
    children[0].stdout.write('secret-output');
    cancelPowerShellRun(owner.id, runId);
    children[0].emit('close', null);
    await settlePowerShellRunsForTesting();
    const history = await listPowerShellHistory();
    expect(history[0]).toMatchObject({ sha256: preview.sha256, cwd: process.cwd(), elevated: true, cancelled: true });
    const stored = await readFile(join(directories[0], 'powershell-history.json'), 'utf8');
    expect(stored).not.toContain('Get-Date');
    expect(stored).not.toContain('secret-output');
  });
});

describe('PowerShell catalog normalization', () => {
  it('drops empty ValidateSet arrays and malformed entries', () => {
    const commands = normalizeCatalog([
      { name: 'Get-Thing', parameterSets: [{ name: 'A', parameters: [{ name: 'Mode', type: 'string', mandatory: 1, validateSet: [] }, { name: 'Kind', type: 'string', validateSet: ['x'] }] }] },
      null, { name: 5 },
    ]);
    expect(commands).toEqual([{ name: 'Get-Thing', parameterSets: [{ name: 'A', parameters: [{ name: 'Mode', type: 'string', mandatory: false }, { name: 'Kind', type: 'string', mandatory: false, validateSet: ['x'] }] }] }]);
    expect(() => normalizeCatalog({})).toThrow();
  });
});
