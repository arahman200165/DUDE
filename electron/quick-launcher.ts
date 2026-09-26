import { app, BrowserWindow, globalShortcut, ipcMain, screen, type Rectangle } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+Space';
let accelerator: string | null = null;
let receiver: BrowserWindow | null = null;
let rendererReady = false;
let pendingOpen: { compact: boolean } | null = null;
let originalBounds: Rectangle | null = null;
let restoringGeometry = false;

function bindingPath(): string {
  return join(app.getPath('userData'), 'quick-launcher-hotkey-binding.json');
}

async function loadBinding(): Promise<string | null> {
  try {
    const value = JSON.parse(await fs.readFile(bindingPath(), 'utf8')) as { accelerator?: unknown };
    return value.accelerator === null || typeof value.accelerator === 'string' ? value.accelerator : DEFAULT_ACCELERATOR;
  } catch {
    return DEFAULT_ACCELERATOR;
  }
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

function dismissCompact(): void {
  if (!receiver || !originalBounds) return;
  const bounds = originalBounds;
  originalBounds = null;
  restoringGeometry = true;
  try {
    if (receiver.isVisible()) receiver.hide();
    receiver.setBounds(bounds);
  } finally {
    restoringGeometry = false;
  }
}

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
      await fs.writeFile(bindingPath(), JSON.stringify({ accelerator }), 'utf8');
      return { ok: true };
    } catch {
      if (accelerator) globalShortcut.unregister(accelerator);
      accelerator = previous;
      if (previous) globalShortcut.register(previous, triggerQuickLauncher);
      return { ok: false, error: 'persistence-failed' };
    }
  });
}
