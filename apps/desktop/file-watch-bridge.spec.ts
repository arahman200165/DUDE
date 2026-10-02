import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  handles: new Map<string, (...args: any[]) => any>(),
  granted: true,
  callback: null as null | ((event: string, filename: string | null) => void),
  close: vi.fn(),
  watch: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => mock.handles.set(channel, handler) },
}));
vi.mock('node:fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs')>(),
  watch: mock.watch,
}));
vi.mock('./fs-bridge', () => ({ isRootGranted: () => mock.granted }));
vi.mock('./fs-grants', () => ({
  resolveInRoot: (root: string, relative: string) => relative.startsWith('..') ? null : root + '/' + relative,
}));

describe('ephemeral file watches', () => {
  beforeEach(() => {
    vi.resetModules();
    mock.handles.clear();
    mock.granted = true;
    mock.close.mockClear();
    mock.watch.mockReset().mockImplementation((_path, _options, callback) => {
      mock.callback = callback;
      const watcher = new EventEmitter();
      Object.assign(watcher, { close: mock.close });
      return watcher;
    });
  });

  it('requires a grant, scopes paths, reports recursive change paths, and binds unwatch to the owner', async () => {
    const { registerFileWatchHandlers } = await import('./file-watch-bridge');
    registerFileWatchHandlers();
    const watch = mock.handles.get('dude:fileWatch:watch')!;
    const unwatch = mock.handles.get('dude:fileWatch:unwatch')!;
    const owner = Object.assign(new EventEmitter(), { id: 7, isDestroyed: () => false, send: vi.fn() });
    const other = Object.assign(new EventEmitter(), { id: 8, isDestroyed: () => false, send: vi.fn() });

    mock.granted = false;
    expect(watch({ sender: owner }, '/root', '.', true)).toEqual({ ok: false, error: 'not-granted' });
    mock.granted = true;
    expect(watch({ sender: owner }, '/root', '../outside', true)).toEqual({ ok: false, error: 'invalid-path' });
    const result = watch({ sender: owner }, '/root', '.', true);
    expect(result.ok).toBe(true);
    expect(mock.watch).toHaveBeenCalledWith('/root/.', { recursive: true }, expect.any(Function));
    mock.callback!('change', '.git\\index');
    expect(owner.send).toHaveBeenCalledWith('dude:fileWatch:event', {
      id: result.watchId, kind: 'changed', relativePath: '.git/index',
    });

    unwatch({ sender: other }, result.watchId);
    expect(mock.close).not.toHaveBeenCalled();
    unwatch({ sender: owner }, result.watchId);
    expect(mock.close).toHaveBeenCalledTimes(1);
  });

  it('closes a watch when its renderer is destroyed', async () => {
    const { registerFileWatchHandlers } = await import('./file-watch-bridge');
    registerFileWatchHandlers();
    const owner = Object.assign(new EventEmitter(), { id: 7, isDestroyed: () => true, send: vi.fn() });
    const result = mock.handles.get('dude:fileWatch:watch')!({ sender: owner }, '/root', '.', true);
    owner.emit('destroyed');
    expect(mock.close).toHaveBeenCalledTimes(1);
    mock.handles.get('dude:fileWatch:unwatch')!({ sender: owner }, result.watchId);
    expect(mock.close).toHaveBeenCalledTimes(1);
  });
});
