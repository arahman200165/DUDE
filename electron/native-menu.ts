import { app, dialog, ipcMain, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { enqueueOpenPath, pickOpenFile } from './open-bridge';
import { checkForUpdates } from './update-bridge';
import type { NativeMenuToolInfo } from '../src/app/core/platform/electron-bridge';

let activeSendAction: ((action: string) => void) | null = null;
const preRegistrationActions: string[] = [];

/**
 * Sends a declared navigation action (`'preferences'`, `'command-palette'`, `tool:<id>`) to the
 * renderer through the native menu's ready-gated queue — shared with other main-process surfaces
 * (the tray's "Settings…") so they never need their own IPC channel. Actions sent before
 * `registerNativeMenu` runs are held and replayed into its queue.
 */
export function sendMenuAction(action: string): void {
  if (activeSendAction) activeSendAction(action);
  else preRegistrationActions.push(action);
}

/** Main owns OS menu mechanics; renderer receives only declared navigation commands. */
export function registerNativeMenu(window: BrowserWindow): void {
  let rendererReady = false;
  const pending: string[] = [];
  const sendAction = (action: string) => {
    if (!rendererReady || window.webContents.isDestroyed()) { pending.push(action); return; }
    window.webContents.send('dude:menu:action', action);
  };
  activeSendAction = sendAction;
  while (preRegistrationActions.length) sendAction(preRegistrationActions.shift()!);
  ipcMain.on('dude:menu:ready', (event) => {
    if (event.sender !== window.webContents) return;
    rendererReady = true;
    while (pending.length) window.webContents.send('dude:menu:action', pending.shift());
  });
  window.webContents.on('did-start-loading', () => { rendererReady = false; });

  const staticTemplate: MenuItemConstructorOptions[] = [
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
  let toolMenuData: readonly NativeMenuToolInfo[] = [];
  const rebuild = () => {
    const grouped = new Map<string, NativeMenuToolInfo[]>();
    for (const tool of toolMenuData) {
      const bucket = grouped.get(tool.category) ?? [];
      bucket.push(tool);
      grouped.set(tool.category, bucket);
    }
    const submenu: MenuItemConstructorOptions[] = grouped.size
      ? [...grouped].map(([category, tools]) => ({
          label: category === 'date-time' ? 'Date & Time' : category.replace(/(^|-)([a-z])/g, (_match, _dash, letter: string) => letter.toUpperCase()),
          submenu: tools.map((tool) => ({
            label: tool.title.replaceAll('&', '&&'),
            click: () => sendAction(`tool:${tool.id}`),
          })),
        }))
      : [{ label: 'Loading tools...', enabled: false }];
    const template: MenuItemConstructorOptions[] = [
      ...staticTemplate.slice(0, 3),
      { label: 'Tools', submenu },
      ...staticTemplate.slice(3),
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  };
  ipcMain.handle('dude:menu:setToolMenuData', (event, value: unknown) => {
    if (event.sender !== window.webContents) return { ok: false, error: 'unauthorized' };
    const parsed = parseToolMenuData(value);
    if (!parsed) return { ok: false, error: 'invalid-tool-menu-data' };
    toolMenuData = parsed;
    rebuild();
    return { ok: true };
  });
  rebuild();
}

/** Renderer IPC data is checked before it becomes an OS menu label or action. */
export function parseToolMenuData(value: unknown): readonly NativeMenuToolInfo[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const tools: NativeMenuToolInfo[] = [];
  const ids = new Set<string>();
  const categories = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { id, title, route, category } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id) || ids.has(id)) return null;
    if (typeof title !== 'string' || !title || title.length > 120 || /[\x00-\x1f]/.test(title)) return null;
    if (typeof route !== 'string' || !route.startsWith('/tools/') || route.length > 160) return null;
    if (typeof category !== 'string' || !/^[a-z-]{1,30}$/.test(category)) return null;
    ids.add(id);
    categories.add(category);
    if (categories.size > 16) return null;
    tools.push({ id, title, route, category });
  }
  return tools;
}
