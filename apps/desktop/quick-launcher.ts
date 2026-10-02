import { BrowserWindow, globalShortcut, ipcMain, screen, type Rectangle } from 'electron';
import { loadDoc, saveDoc } from './device-store/device-docs';

const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+Space';
let accelerator: string | null = null;
let receiver: BrowserWindow | null = null;
let rendererReady = false;
let pendingOpen: { compact: boolean } | null = null;
let originalBounds: Rectangle | null = null;
let restoringGeometry = false;

/** Legacy-import decoder: `{ accelerator: string | null }`. */
export function decodeQuickLauncherBinding(raw: unknown): { accelerator: string | null } | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = (raw as { accelerator?: unknown }).accelerator;
  return value === null || typeof value === 'string' ? { accelerator: value } : null;
}

async function loadBinding(): Promise<string | null> {
  return (await loadDoc('quick-launcher-hotkey', decodeQuickLauncherBinding, { accelerator: DEFAULT_ACCELERATOR })).accelerator;
}

function flush(): void {
  if (!receiver || receiver.isDestroyed() || !rendererReady || !pendingOpen) return;
  receiver.webContents.send('dude:quickLauncher:open', pendingOpen);
  pendingOpen = null;
}

function launcherBounds(): Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const width = Math.min(720, area.width);
  const height = Math.min(480, area.height);
  return {
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.max(0, Math.floor((area.height - height) / 3)),
    width,
    height,
  };
}

function restoreCompact(hide: boolean): void {
  if (!receiver || !originalBounds) return;
  const bounds = originalBounds;
  originalBounds = null;
  pendingOpen = null;
  if (hide) receiver.webContents.send('dude:quickLauncher:dismissed');
  restoringGeometry = true;
  try {
    if (hide && receiver.isVisible()) receiver.hide();
    receiver.setBounds(bounds);
  } finally {
    restoringGeometry = false;
  }
}

function dismissCompact(): void { restoreCompact(true); }

export function isQuickLauncherGeometry(window: BrowserWindow): boolean {
  return receiver === window && (originalBounds !== null || restoringGeometry);
}

export function triggerQuickLauncher(): void {
  const window = receiver ?? BrowserWindow.getAllWindows()[0];
  if (!window || window.isDestroyed()) return;
  const compact = !window.isVisible() || originalBounds !== null;
  if (compact && !originalBounds) {
    originalBounds = window.getBounds();
    window.setBounds(launcherBounds());
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  pendingOpen = { compact };
  flush();
}

export function registerQuickLauncherRenderer(window: BrowserWindow): void {
  receiver = window;
  ipcMain.on('dude:quickLauncher:ready', (event) => {
    if (event.sender !== window.webContents) return;
    rendererReady = true;
    flush();
  });
  ipcMain.handle('dude:quickLauncher:dismiss', (event) => {
    if (event.sender !== window.webContents) return { ok: false, error: 'unauthorized' };
    dismissCompact();
    return { ok: true };
  });
  ipcMain.handle('dude:quickLauncher:promote', (event) => {
    if (event.sender !== window.webContents) return { ok: false, error: 'unauthorized' };
    restoreCompact(false);
    return { ok: true };
  });
  window.on('blur', dismissCompact);
  window.on('hide', dismissCompact);
  window.on('closed', () => {
    receiver = null;
    rendererReady = false;
    originalBounds = null;
    pendingOpen = null;
  });
  window.webContents.on('did-start-loading', () => { rendererReady = false; });
}

export async function registerQuickLauncherHotkey(): Promise<void> {
  const persisted = await loadBinding();
  if (persisted) {
    try {
      if (globalShortcut.register(persisted, triggerQuickLauncher)) accelerator = persisted;
    } catch { /* Invalid stored shortcut remains editable in Settings. */ }
  }
  ipcMain.handle('dude:quickLauncher:getHotkey', () => accelerator);
  ipcMain.handle('dude:quickLauncher:setHotkey', async (_event, next: unknown) => {
    if (next !== null && (typeof next !== 'string' || next.length > 100 || !next)) {
      return { ok: false, error: 'invalid-accelerator' };
    }
    if (next === accelerator) return { ok: true };
    if (next) {
      try {
        if (!globalShortcut.register(next, triggerQuickLauncher)) return { ok: false, error: 'registration-failed' };
      } catch { return { ok: false, error: 'invalid-accelerator' }; }
    }
    const previous = accelerator;
    accelerator = next;
    if (previous) globalShortcut.unregister(previous);
    try {
      await saveDoc('quick-launcher-hotkey', { accelerator });
      return { ok: true };
    } catch {
      if (accelerator) globalShortcut.unregister(accelerator);
      accelerator = previous;
      if (previous) globalShortcut.register(previous, triggerQuickLauncher);
      return { ok: false, error: 'persistence-failed' };
    }
  });
}
