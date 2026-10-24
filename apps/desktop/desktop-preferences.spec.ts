const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  docs: new Map<string, unknown>(),
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => 'C:/ud', setLoginItemSettings: () => undefined },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
  screen: { getAllDisplays: () => [], getPrimaryDisplay: () => ({ id: 1 }) },
}));
vi.mock('./device-store/device-docs', () => ({
  loadDoc: async (name: string, decode: (raw: unknown) => unknown, fallback: unknown) => (mock.docs.has(name) ? decode(mock.docs.get(name)) ?? fallback : fallback),
  saveDoc: async (name: string, value: unknown) => { mock.docs.set(name, structuredClone(value)); },
}));

import { HUB_NOTIFICATION_KINDS } from '@dude/contracts/hub';

const window = { webContents: { send: vi.fn() } } as any;

async function fresh() {
  vi.resetModules();
  mock.handlers.clear();
  return import('./desktop-preferences');
}

const allOff = Object.fromEntries(HUB_NOTIFICATION_KINDS.map((kind) => [kind, false]));

describe('desktop preferences: Hub notification kinds (PD-110)', () => {
  beforeEach(() => { mock.docs.clear(); window.webContents.send.mockClear(); });

  it('defaults every kind to off, on a first run and for a document saved before the setting existed', async () => {
    let prefs = await fresh();
    await prefs.loadDesktopPreferences();
    expect(prefs.getDesktopPreferences().hubNotifications).toEqual(allOff);

    mock.docs.set('desktop-preferences', { closeToTray: false, notifyUpdates: false });
    prefs = await fresh();
    await prefs.loadDesktopPreferences();
    expect(prefs.getDesktopPreferences()).toMatchObject({ closeToTray: false, hubNotifications: allOff });
  });

  it('saves a kind locally in the desktop-preferences doc and reads it back after a restart', async () => {
    let prefs = await fresh();
    await prefs.loadDesktopPreferences();
    prefs.registerDesktopPreferencesHandlers(window);
    const result = await mock.handlers.get('dude:preferences:set')!({}, { hubNotifications: { ...allOff, 'backup-failed': true } });
    expect(result).toMatchObject({ ok: true, value: { hubNotifications: { 'backup-failed': true, 'security-alert': false } } });
    expect((mock.docs.get('desktop-preferences') as { hubNotifications: Record<string, boolean> }).hubNotifications['backup-failed']).toBe(true);
    expect(window.webContents.send).toHaveBeenCalledWith('dude:preferences:changed', expect.objectContaining({ hubNotifications: expect.objectContaining({ 'backup-failed': true }) }));

    prefs = await fresh();
    await prefs.loadDesktopPreferences();
    expect(prefs.getDesktopPreferences().hubNotifications['backup-failed']).toBe(true);
    expect(prefs.getDesktopPreferences().hubNotifications['tls-renewed']).toBe(false);
  });

  it('keeps only known kinds and strict booleans, and a patch of another setting leaves the kinds alone', async () => {
    const prefs = await fresh();
    await prefs.loadDesktopPreferences();
    prefs.registerDesktopPreferencesHandlers(window);
    const set = mock.handlers.get('dude:preferences:set')!;
    await set({}, { hubNotifications: { 'backup-failed': 'yes', 'security-alert': 1, 'tls-renewed': true, bogus: true } });
    expect(prefs.getDesktopPreferences().hubNotifications).toEqual({ ...allOff, 'tls-renewed': true });
    await set({}, { hubNotifications: 'all' });
    expect(prefs.getDesktopPreferences().hubNotifications).toEqual(allOff);
    await set({}, { hubNotifications: { ...allOff, 'address-changed': true } });
    await set({}, { closeToTray: false });
    expect(prefs.getDesktopPreferences().hubNotifications['address-changed']).toBe(true);
  });

  it('hands out a copy, so a caller cannot change the stored kinds', async () => {
    const prefs = await fresh();
    await prefs.loadDesktopPreferences();
    (prefs.getDesktopPreferences().hubNotifications as Record<string, boolean>)['backup-failed'] = true;
    expect(prefs.getDesktopPreferences().hubNotifications['backup-failed']).toBe(false);
  });
});
