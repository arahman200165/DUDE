const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  writeText: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: () => '__missing_hotkey_test_directory__' },
  clipboard: { readText: () => '', writeText: mock.writeText },
  globalShortcut: { register: () => true, unregister: () => {}, unregisterAll: () => {} },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => mock.handlers.set(channel, handler) },
}));

import { registerHotkeyHandlers } from './hotkey-bridge';

describe('Quick Action IPC', () => {
  it('runs only registered action ids', async () => {
    await registerHotkeyHandlers();
    const run = mock.handlers.get('dude:quickActions:run');
    expect(run).toBeDefined();

    expect(await run!(null, 'arbitrary-command')).toEqual({ ok: false, error: 'unknown-action' });
    expect(await run!(null, { id: 'uuid-generate-clipboard' })).toEqual({ ok: false, error: 'unknown-action' });
    expect(mock.writeText).not.toHaveBeenCalled();

    expect(await run!(null, 'uuid-generate-clipboard')).toEqual({ ok: true });
    expect(mock.writeText).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/));
  });
});
