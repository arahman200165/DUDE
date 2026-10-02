import { app, screen, type BrowserWindow, type Rectangle } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { getDesktopPreferences } from './desktop-preferences';
import { isQuickLauncherGeometry } from './quick-launcher';

function path(): string { return join(app.getPath('userData'), 'window-bounds.json'); }

function fitsDisplay(bounds: Rectangle, display: Electron.Display): boolean {
  const area = display.workArea;
  return bounds.width >= 640 && bounds.height >= 480 &&
    bounds.x < area.x + area.width - 100 && bounds.y < area.y + area.height - 100 &&
    bounds.x + bounds.width > area.x + 100 && bounds.y + bounds.height > area.y + 100;
}

export async function initialWindowBounds(): Promise<Rectangle> {
  const prefs = getDesktopPreferences();
  const displays = screen.getAllDisplays();
  const preferred = displays.find((display) => display.id === prefs.preferredDisplayId);
  if (prefs.rememberWindowBounds && (prefs.preferredDisplayId === null || preferred)) {
    try {
      const stored = JSON.parse(await fs.readFile(path(), 'utf8')) as Rectangle;
      if (preferred ? fitsDisplay(stored, preferred) : displays.some((display) => fitsDisplay(stored, display))) return stored;
    } catch { /* First launch has no bounds. */ }
  }
  const area = (preferred ?? screen.getPrimaryDisplay()).workArea;
  const width = Math.min(1280, area.width);
  const height = Math.min(800, area.height);
  return { x: area.x + Math.floor((area.width - width) / 2), y: area.y + Math.floor((area.height - height) / 2), width, height };
}

export function trackWindowBounds(window: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const persist = (): void => {
    if (!getDesktopPreferences().rememberWindowBounds || window.isMaximized() || window.isMinimized() || isQuickLauncherGeometry(window)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!isQuickLauncherGeometry(window)) void fs.writeFile(path(), JSON.stringify(window.getBounds()), 'utf8').catch(() => {});
    }, 500);
  };
  window.on('resize', persist);
  window.on('move', persist);
  window.on('closed', () => { if (timer) clearTimeout(timer); });
}
