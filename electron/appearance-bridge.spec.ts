const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
}));
vi.mock('electron', () => ({
  app: { getPath: () => '.' },
  nativeTheme: { themeSource: 'system' },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
}));

import { DEFAULT_NATIVE_APPEARANCE, parseNativeAppearance, registerAppearanceBridge } from './appearance-bridge';

describe('parseNativeAppearance', () => {
  it('accepts a valid pair', () => {
    expect(parseNativeAppearance({ mode: 'light', background: '#EEF1f5' })).toEqual({ mode: 'light', background: '#EEF1f5' });
  });

  it.each([
    null, undefined, 'x', 42, [], [{ mode: 'dark', background: '#000000' }],
    { mode: 'system', background: '#000000' },
    { mode: 'dark', background: '#000' },
    { mode: 'dark', background: '000000' },
    { mode: 'dark', background: '#00000000' },
    { mode: 'dark', background: 'red' },
    { mode: 'dark', background: 5 },
    { mode: 'dark' },
    { mode: 'dark', background: '#000000', extra: 1 },
  ])('rejects %j', (value) => {
    expect(parseNativeAppearance(value)).toBeNull();
  });

  it('defaults to the dark token background', () => {
    expect(DEFAULT_NATIVE_APPEARANCE).toEqual({ mode: 'dark', background: '#0a0e14' });
  });
});

describe('dude:appearance:set', () => {
  const webContents = {};
  let theme: { themeSource: string };
  let window: { webContents: object; setBackgroundColor: ReturnType<typeof vi.fn> };
  let persist: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mock.handlers.clear();
    theme = { themeSource: 'system' };
    window = { webContents, setBackgroundColor: vi.fn() };
    persist = vi.fn();
    registerAppearanceBridge(window as never, { nativeTheme: theme as never, persist });
  });

  function invoke(sender: unknown, payload: unknown) {
    return mock.handlers.get('dude:appearance:set')!({ sender }, payload) as Promise<{ ok: boolean; error?: string }>;
  }

  it('applies, sets the background and persists a valid call', async () => {
    expect(await invoke(webContents, { mode: 'light', background: '#eef1f5' })).toEqual({ ok: true });
    expect(theme.themeSource).toBe('light');
    expect(window.setBackgroundColor).toHaveBeenCalledWith('#eef1f5');
    expect(persist).toHaveBeenCalledWith({ mode: 'light', background: '#eef1f5' });
  });

  it.each([
    { mode: 'auto', background: '#000000' },
    { mode: 'dark', background: 'url(x)' },
    'dark',
    null,
    { mode: 'dark', background: '#000000', __proto__x: 1 },
  ])('rejects %j without side effects', async (payload) => {
    expect(await invoke(webContents, payload)).toEqual({ ok: false, error: 'invalid appearance' });
    expect(theme.themeSource).toBe('system');
    expect(window.setBackgroundColor).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('rejects an untrusted sender', async () => {
    expect((await invoke({}, { mode: 'dark', background: '#000000' })).ok).toBe(false);
    expect(theme.themeSource).toBe('system');
    expect(window.setBackgroundColor).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('still succeeds when persistence fails', async () => {
    persist.mockRejectedValue(new Error('disk'));
    expect(await invoke(webContents, { mode: 'dark', background: '#0a0e14' })).toEqual({ ok: true });
  });
});
