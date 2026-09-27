import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import { dirname, join } from 'node:path';
import { promises as fs } from 'node:fs';
import { parseFileAssociations } from './file-association-marker';
import { markCleanExit } from './crash-detection';
import { sendMenuAction } from './native-menu';

/**
 * System tray + launch-on-login (Phase 8 Stage 5). Closing the main window
 * now hides it instead of quitting — a deliberate behavior change from
 * Stage 1, where `window-all-closed` always called `app.quit()`. The tray's
 * "Quit DUDE" (or any other `app.quit()` call) sets `isQuitting` via
 * `before-quit`, which the window's own `close` handler checks to allow a
 * real close to proceed.
 */

let isQuitting = false;

export function isAppQuitting(): boolean {
  return isQuitting;
}

app.on('before-quit', () => {
  isQuitting = true;
  markCleanExit();
});

export function createTray(window: BrowserWindow): Tray {
  // `__dirname` is `dist/electron` (esbuild's outdir); the icon ships as a
  // source asset under the repo's `public/`, not a build output, so it's
  // reached the same way in both `electron:dev` and `electron:start`.
  const iconPath = join(__dirname, '../dude/browser/icons/icon-72x72.png');
  const icon = nativeImage.createFromPath(iconPath);

  const tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('DUDE');

  const showWindow = (): void => {
    window.show();
    window.focus();
  };

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show DUDE', click: showWindow },
      { label: 'Settings…', click: () => { showWindow(); sendMenuAction('preferences'); } },
      { type: 'separator' },
      { label: 'Quit DUDE', click: () => app.quit() },
    ]),
  );
  tray.on('click', showWindow);

  return tray;
}

export function registerShellChromeHandlers(): void {
  ipcMain.handle('dude:shell:getFileAssociations', async () => {
    try {
      const marker = join(dirname(app.getPath('exe')), 'file-associations.json');
      const stat = await fs.stat(marker);
      if (stat.size > 4096) return null;
      return parseFileAssociations(JSON.parse(await fs.readFile(marker, 'utf8')));
    } catch { return null; }
  });
  ipcMain.handle('dude:shell:openDefaultApps', async () => {
    try { await shell.openExternal('ms-settings:defaultapps'); return { ok: true }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Could not open Windows Settings.' }; }
  });
  ipcMain.handle('dude:shell:getLaunchOnLogin', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('dude:shell:setLaunchOnLogin', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
    return { ok: true };
  });
}
