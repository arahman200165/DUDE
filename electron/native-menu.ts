import { app, dialog, ipcMain, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { enqueueOpenPath, pickOpenFile } from './open-bridge';
import { checkForUpdates } from './update-bridge';

/** Main owns OS menu mechanics; renderer receives only declared navigation commands. */
export function registerNativeMenu(window: BrowserWindow): void {
  let rendererReady = false;
  const pending: string[] = [];
  const sendAction = (action: string) => {
    if (!rendererReady || window.webContents.isDestroyed()) { pending.push(action); return; }
    window.webContents.send('dude:menu:action', action);
  };
  ipcMain.on('dude:menu:ready', (event) => {
    if (event.sender !== window.webContents) return;
    rendererReady = true;
    while (pending.length) window.webContents.send('dude:menu:action', pending.shift());
  });
  window.webContents.on('did-start-loading', () => { rendererReady = false; });

  const template: MenuItemConstructorOptions[] = [
    { label: 'File', submenu: [
      { label: 'Open File...', accelerator: 'CmdOrCtrl+O', click: () => { void pickOpenFile(window); } },
      { label: 'Open Folder...', click: () => {
        void dialog.showOpenDialog(window, { properties: ['openDirectory'] }).then((result) => {
          if (!result.canceled && result.filePaths[0]) void enqueueOpenPath(result.filePaths[0]);
        });
      } },
      { type: 'separator' },
      { label: 'Preferences', accelerator: 'CmdOrCtrl+,', click: () => sendAction('preferences') },
      { type: 'separator' },
      { label: 'Exit', click: () => app.quit() },
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
      { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => sendAction('command-palette') },
    ] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
    { label: 'Help', submenu: [
      { label: 'Check for Updates', click: () => { void checkForUpdates(); } },
      { label: 'Documentation', click: () => { void shell.openExternal('https://github.com/arahman200165/DUDE#readme'); } },
      { label: 'About DUDE', click: () => { void dialog.showMessageBox(window, {
        type: 'info', title: 'About DUDE', message: 'DUDE', detail: `Developer Utility Dashboard Engine\nVersion ${app.getVersion()}`,
      }); } },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
