const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  events: new Map<string, (...args: unknown[]) => void>(),
  register: vi.fn(() => true),
  unregister: vi.fn(),
  writeFile: vi.fn(async () => {}),
  send: vi.fn(),
  visible: false,
  bounds: { x: 100, y: 100, width: 1200, height: 800 },
}));

vi.mock('electron', () => ({
  app: { getPath: () => '__quick_launcher_test__' },
  BrowserWindow: { getAllWindows: () => [] },
  globalShortcut: { register: mock.register, unregister: mock.unregister },
  ipcMain: {
    on: (channel: string, handler: (...args: unknown[]) => void) => mock.events.set(channel, handler),
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => mock.handlers.set(channel, handler),
  },
  screen: {
    getCursorScreenPoint: () => ({ x: 500, y: 500 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
}));
vi.mock('node:fs', () => ({
  promises: { readFile: async () => { throw new Error('missing'); }, writeFile: mock.writeFile },
}));

import { loadDoc } from './device-store/device-docs';
import { isQuickLauncherGeometry, registerQuickLauncherHotkey, registerQuickLauncherRenderer, triggerQuickLauncher } from './quick-launcher';

describe('Quick Launcher main process', () => {
  it('resizes only a hidden window, queues opening, and restores bounds on dismiss', async () => {
    const windowEvents = new Map<string, () => void>();
    const webEvents = new Map<string, () => void>();
    const webContents = { send: mock.send, isDestroyed: () => false, on: (name: string, fn: () => void) => webEvents.set(name, fn) };
    const window = {
      webContents,
      isDestroyed: () => false,
      isVisible: () => mock.visible,
      isMinimized: () => false,
      getBounds: () => ({ ...mock.bounds }),
      setBounds: vi.fn((bounds: typeof mock.bounds) => { mock.bounds = { ...bounds }; }),
      show: vi.fn(() => { mock.visible = true; }),
      hide: vi.fn(() => { mock.visible = false; windowEvents.get('hide')?.(); }),
      focus: vi.fn(),
      on: (name: string, fn: () => void) => windowEvents.set(name, fn),
    };
    registerQuickLauncherRenderer(window as never);
    await registerQuickLauncherHotkey();
    expect(mock.register).toHaveBeenCalledWith('CommandOrControl+Shift+Space', triggerQuickLauncher);
    const original = { ...mock.bounds };

    triggerQuickLauncher();
    expect(isQuickLauncherGeometry(window as never)).toBe(true);
    expect(window.setBounds).toHaveBeenCalledWith({ x: 600, y: 200, width: 720, height: 480 });
    expect(mock.send).not.toHaveBeenCalled();
    mock.events.get('dude:quickLauncher:ready')!({ sender: webContents });
    expect(mock.send).toHaveBeenCalledWith('dude:quickLauncher:open', { compact: true });

    expect(mock.handlers.get('dude:quickLauncher:dismiss')!({ sender: {} })).toEqual({ ok: false, error: 'unauthorized' });
    expect(mock.handlers.get('dude:quickLauncher:dismiss')!({ sender: webContents })).toEqual({ ok: true });
    expect(window.hide).toHaveBeenCalledOnce();
    expect(mock.bounds).toEqual(original);
    expect(isQuickLauncherGeometry(window as never)).toBe(false);

    mock.visible = true;
    window.setBounds.mockClear();
    triggerQuickLauncher();
    expect(window.setBounds).not.toHaveBeenCalled();
    expect(mock.send).toHaveBeenLastCalledWith('dude:quickLauncher:open', { compact: false });

    mock.visible = false;
    triggerQuickLauncher();
    expect(isQuickLauncherGeometry(window as never)).toBe(true);
    expect(mock.handlers.get('dude:quickLauncher:promote')!({ sender: webContents })).toEqual({ ok: true });
    expect(isQuickLauncherGeometry(window as never)).toBe(false);
    expect(mock.visible).toBe(true);
    expect(mock.bounds).toEqual(original);

    expect(await mock.handlers.get('dude:quickLauncher:setHotkey')!(null, 'Control+Alt+L')).toEqual({ ok: true });
    expect(await loadDoc('quick-launcher-hotkey', (raw) => raw, null)).toEqual({ accelerator: 'Control+Alt+L' });
    expect(mock.unregister).toHaveBeenCalledWith('CommandOrControl+Shift+Space');
  });
});

