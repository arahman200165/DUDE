const mock = vi.hoisted(() => ({
  handles: new Map<string, (...args: unknown[]) => unknown>(),
  stat: vi.fn(async () => ({ isDirectory: () => true, isFile: () => false })),
  grant: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    on: vi.fn(),
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => mock.handles.set(channel, handler),
  },
}));
vi.mock('node:fs', () => ({ promises: { stat: mock.stat, readFile: vi.fn() } }));
vi.mock('./fs-bridge', () => ({ grantExternalDirectory: mock.grant }));

import { registerOpenHandlers } from './open-bridge';

describe('dropped directory path IPC', () => {
  it('accepts only a checked directory from the current renderer', async () => {
    const webContents = { on: vi.fn(), send: vi.fn() };
    registerOpenHandlers({ webContents, on: vi.fn(), isDestroyed: () => false } as never);
    const enqueue = mock.handles.get('dude:open:enqueuePath')!;
    const path = 'C:\\Dropped';
    expect(await enqueue({ sender: {} }, path)).toEqual({ ok: false, error: 'unauthorized' });
    expect(await enqueue({ sender: webContents }, 'relative/path')).toEqual({ ok: false, error: 'invalid-path' });
    expect(mock.stat).not.toHaveBeenCalled();
    mock.stat.mockResolvedValueOnce({ isDirectory: () => false, isFile: () => true });
    expect(await enqueue({ sender: webContents }, path)).toEqual({ ok: false, error: 'not-a-directory' });
    expect(await enqueue({ sender: webContents }, path)).toEqual({ ok: true });
    expect(mock.grant).toHaveBeenCalledWith(path);
  });
});

describe('native recents "reopen" IPC', () => {
  it('accepts only a checked absolute path from the current renderer', async () => {
    const webContents = { on: vi.fn(), send: vi.fn() };
    registerOpenHandlers({ webContents, on: vi.fn(), isDestroyed: () => false } as never);
    const reopen = mock.handles.get('dude:open:reopen')!;
    expect(await reopen({ sender: {} }, 'C:\\notes.md')).toEqual({ ok: false, error: 'unauthorized' });
    expect(await reopen({ sender: webContents }, 'relative/path')).toEqual({ ok: false, error: 'invalid-path' });
  });
});

