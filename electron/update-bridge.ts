import { app, ipcMain, Notification, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { getDesktopPreferences } from './desktop-preferences';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Wraps `electron-updater`'s `autoUpdater` (Phase 8 Stage 8). Downloads a
 * found update automatically in the background (`autoDownload = true`) but
 * never installs it without the user clicking "Restart & Install" in the
 * renderer — mirroring the web build's "never applied silently" update
 * precedent (`core/connectivity/update.service.ts`). Checks are driven from
 * here, not the renderer, matching how other backend lifecycle logic (the
 * LLM proxy) lives in its own `*-bridge.ts` rather than a renderer-side
 * interval.
 *
 * `autoUpdater` throws when the app isn't a real packaged install (e.g. the
 * `electron:dev`/`electron:start` unpacked launch path) — every call here is
 * caught so dev runs just no-op instead of crashing.
 */
export async function checkForUpdates(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    autoUpdater.autoDownload = getDesktopPreferences().updateMode === 'auto-download';
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Update check failed.' };
  }
}

export function registerUpdateHandlers(window: BrowserWindow): void {
  autoUpdater.autoDownload = getDesktopPreferences().updateMode === 'auto-download';

  autoUpdater.on('update-available', (info) => {
    if (!window.isDestroyed()) window.webContents.send('dude:update:available', { version: info.version });
    const prefs = getDesktopPreferences();
    if (prefs.notifyUpdates && prefs.updateMode === 'notify' && Notification.isSupported()) {
      new Notification({ title: 'DUDE update available', body: `Version ${info.version} is ready to download.` }).show();
    }
  });
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-downloaded', (info) => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send('dude:update:downloaded', { version: info.version });
    }
    if (getDesktopPreferences().notifyUpdates && Notification.isSupported()) {
      new Notification({ title: 'DUDE update ready', body: `Version ${info.version} is ready to install.` }).show();
    }
  });

  autoUpdater.on('error', (error) => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send('dude:update:error', error.message);
    }
  });

  ipcMain.handle('dude:update:check', checkForUpdates);

  ipcMain.handle('dude:update:download', async () => {
    try { await autoUpdater.downloadUpdate(); return { ok: true }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Download failed.' }; }
  });

  ipcMain.handle('dude:update:quitAndInstall', () => {
    autoUpdater.quitAndInstall();
    return { ok: true };
  });

  setInterval(() => {
    const prefs = getDesktopPreferences();
    if (prefs.updateMode === 'manual') return;
    autoUpdater.autoDownload = prefs.updateMode === 'auto-download';
    void autoUpdater.checkForUpdates().catch(() => {});
  }, CHECK_INTERVAL_MS);
}

export function checkForUpdatesOnStartup(): void {
  if (getDesktopPreferences().updateMode === 'manual') return;
  autoUpdater.autoDownload = getDesktopPreferences().updateMode === 'auto-download';
  if (!app.isPackaged) return;
  void autoUpdater.checkForUpdates().catch(() => {});
}
