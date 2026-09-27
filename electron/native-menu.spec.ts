const mock = vi.hoisted(() => ({
  on: new Map<string, (...args: unknown[]) => void>(),
  handle: new Map<string, (...args: unknown[]) => unknown>(),
  buildFromTemplate: vi.fn((template: unknown) => template),
  setApplicationMenu: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { quit: vi.fn(), getVersion: () => '0.0.23' },
  dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  ipcMain: {
    on: (channel: string, handler: (...args: unknown[]) => void) => mock.on.set(channel, handler),
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => mock.handle.set(channel, handler),
  },
  Menu: { buildFromTemplate: mock.buildFromTemplate, setApplicationMenu: mock.setApplicationMenu },
  shell: { openExternal: vi.fn() },
}));
vi.mock('./open-bridge', () => ({ enqueueOpenPath: vi.fn(), pickOpenFile: vi.fn() }));
vi.mock('./update-bridge', () => ({ checkForUpdates: vi.fn() }));

import { parseToolMenuData, registerNativeMenu, sendMenuAction } from './native-menu';

describe('native Tools menu', () => {
  const tool = { id: 'base64', title: 'Base64', route: '/tools/base64', category: 'encoding' };

  it('rejects malformed and duplicate renderer data', () => {
    expect(parseToolMenuData([tool])).toEqual([tool]);
    expect(parseToolMenuData([tool, tool])).toBeNull();
    expect(parseToolMenuData([{ ...tool, title: 'Bad\nlabel' }])).toBeNull();
    expect(parseToolMenuData([{ ...tool, route: 'https://example.test' }])).toBeNull();
    expect(parseToolMenuData([{ ...tool, id: 'bad:action' }])).toBeNull();
  });

  it('accepts a renderer snapshot and queues tool clicks until the renderer is ready', () => {
    const send = vi.fn();
    const webContents = { send, on: vi.fn(), isDestroyed: () => false };
    registerNativeMenu({ webContents } as never);
    const setTools = mock.handle.get('dude:menu:setToolMenuData')!;
    expect(setTools({ sender: {} }, [tool])).toEqual({ ok: false, error: 'unauthorized' });
    expect(setTools({ sender: webContents }, [tool])).toEqual({ ok: true });

    const template = mock.buildFromTemplate.mock.lastCall![0] as Array<{ label: string; submenu: Array<{ label: string; submenu: Array<{ click: () => void }> }> }>;
    expect(template.map((item) => item.label)).toEqual(['File', 'Edit', 'View', 'Tools', 'Window', 'Help']);
    expect(template[3].submenu[0].label).toBe('Encoding');
    template[3].submenu[0].submenu[0].click();
    expect(send).not.toHaveBeenCalled();
    mock.on.get('dude:menu:ready')!({ sender: webContents });
    expect(send).toHaveBeenCalledWith('dude:menu:action', 'tool:base64');
  });

  it('File > Preferences and shared sendMenuAction callers (the tray) go through the same ready-gated queue', () => {
    const send = vi.fn();
    const webContents = { send, on: vi.fn(), isDestroyed: () => false };
    registerNativeMenu({ webContents } as never);
    const template = mock.buildFromTemplate.mock.lastCall![0] as Array<{ label: string; submenu: Array<{ label?: string; click?: () => void }> }>;
    const preferences = template[0].submenu.find((item) => item.label === 'Preferences')!;

    preferences.click!();
    sendMenuAction('preferences');
    expect(send).not.toHaveBeenCalled();

    mock.on.get('dude:menu:ready')!({ sender: webContents });
    expect(send.mock.calls).toEqual([
      ['dude:menu:action', 'preferences'],
      ['dude:menu:action', 'preferences'],
    ]);
  });
});
