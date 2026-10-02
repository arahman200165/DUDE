import { app, ipcMain, screen, type BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

export type UpdateMode = 'auto-download' | 'notify' | 'manual';
export interface DesktopPreferences {
  closeToTray: boolean;
  launchMinimized: boolean;
  startupDestination: 'deck' | 'workspace';
  preferredDisplayId: number | null;
  rememberWindowBounds: boolean;
  updateMode: UpdateMode;
  notifyUpdates: boolean;
  notifyCollaboration: boolean;
}

const DEFAULTS: DesktopPreferences = {
  closeToTray: true,
  launchMinimized: false,
  startupDestination: 'workspace',
  preferredDisplayId: null,
  rememberWindowBounds: true,
  updateMode: 'auto-download',
  notifyUpdates: true,
  notifyCollaboration: true,
};

let preferences: DesktopPreferences = { ...DEFAULTS };
let lastInstallerRequest = '';

function path(): string { return join(app.getPath('userData'), 'desktop-preferences.json'); }

export function getDesktopPreferences(): DesktopPreferences { return { ...preferences }; }

export async function loadDesktopPreferences(): Promise<void> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(path(), 'utf8'));
    if (parsed && typeof parsed === 'object') {
      preferences = sanitize(parsed as Record<string, unknown>);
      lastInstallerRequest = typeof (parsed as Record<string, unknown>)['lastInstallerRequest'] === 'string'
        ? (parsed as Record<string, string>)['lastInstallerRequest'] : '';
    }
  } catch { /* A new profile has no preferences file. */ }
  if (!app.isPackaged) return;
  try {
    const folder = dirname(app.getPath('exe'));
    const request = (await fs.readFile(join(folder, 'setup-request.ini'), 'utf8')).trim();
    if (!request || request === lastInstallerRequest) return;
    const options = await fs.readFile(join(folder, 'setup-options.ini'), 'utf8');
    const mode = /^updateMode=(.*)$/m.exec(options)?.[1]?.trim();
    const login = /^launchOnLogin=(.*)$/m.exec(options)?.[1]?.trim();
    if (mode === 'manual' || mode === 'notify' || mode === 'auto-download') preferences.updateMode = mode;
    if (login === '0' || login === '1') app.setLoginItemSettings({ openAtLogin: login === '1' });
    lastInstallerRequest = request;
    await save();
  } catch { /* An install without setup options uses existing settings. */ }
}

function sanitize(input: Record<string, unknown>): DesktopPreferences {
  return {
    closeToTray: typeof input['closeToTray'] === 'boolean' ? input['closeToTray'] : DEFAULTS.closeToTray,
    launchMinimized: typeof input['launchMinimized'] === 'boolean' ? input['launchMinimized'] : DEFAULTS.launchMinimized,
    startupDestination: input['startupDestination'] === 'deck' ? 'deck' : 'workspace',
    preferredDisplayId: typeof input['preferredDisplayId'] === 'number' ? input['preferredDisplayId'] : null,
    rememberWindowBounds: typeof input['rememberWindowBounds'] === 'boolean' ? input['rememberWindowBounds'] : DEFAULTS.rememberWindowBounds,
    updateMode: input['updateMode'] === 'manual' || input['updateMode'] === 'notify' ? input['updateMode'] : 'auto-download',
    notifyUpdates: typeof input['notifyUpdates'] === 'boolean' ? input['notifyUpdates'] : DEFAULTS.notifyUpdates,
    notifyCollaboration: typeof input['notifyCollaboration'] === 'boolean' ? input['notifyCollaboration'] : DEFAULTS.notifyCollaboration,
  };
}

async function save(): Promise<void> {
  const destination = path();
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ ...preferences, lastInstallerRequest }), 'utf8');
  await fs.rename(temporary, destination);
}

export function registerDesktopPreferencesHandlers(window: BrowserWindow): void {
  ipcMain.handle('dude:preferences:get', () => getDesktopPreferences());
  ipcMain.handle('dude:preferences:set', async (_event, patch: Record<string, unknown>) => {
    if (!patch || typeof patch !== 'object') return { ok: false, error: 'Invalid preferences.' };
    const next = sanitize({ ...preferences, ...patch });
    const previous = preferences;
    preferences = next;
    try { await save(); } catch (error) { preferences = previous; return { ok: false, error: String(error) }; }
    window.webContents.send('dude:preferences:changed', getDesktopPreferences());
    return { ok: true, value: getDesktopPreferences() };
  });
  ipcMain.handle('dude:preferences:displays', () => screen.getAllDisplays().map((display) => ({
    id: display.id,
    label: display.label || `Display ${display.id}`,
    primary: display.id === screen.getPrimaryDisplay().id,
  })));
}
