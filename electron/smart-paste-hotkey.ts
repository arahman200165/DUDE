import { BrowserWindow, app, clipboard, globalShortcut, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * Desktop Global Smart Paste Hotkey (DUDE_PRD.md §21 Phase 24 Item 3) -- a sibling module to
 * hotkey-bridge.ts, not an edit to it: this action's effect is "open the app UI with classified
 * clipboard content," a materially different shape from hotkey-bridge.ts's silent
 * clipboard-to-clipboard QUICK_ACTIONS transforms. Classification itself stays 100% renderer-side
 * (PASTE_DETECTORS, already imported by src/app/tools/* pure-logic files no Electron-safe mirror
 * exists for) -- this module only ever touches clipboard/globalShortcut/window focus, and queues
 * the raw clipboard text to the renderer, mirroring open-bridge.ts's
 * receiver/rendererReady/queue/flush() shape exactly.
 *
 * Registration ordering: `registerSmartPasteHotkey()` runs in `app.whenReady()`, before any
 * `BrowserWindow` exists (same as hotkey-bridge.ts's `registerHotkeyHandlers()`) -- so the trigger
 * callback below must resolve a window lazily via `BrowserWindow.getAllWindows()[0]`, mirroring the
 * `second-instance` handler's existing pattern in main.ts, rather than capturing one at
 * registration time.
 */

let accelerator: string | null = null;
let receiver: BrowserWindow | null = null;
let rendererReady = false;
const queue: string[] = [];

function bindingPath(): string {
  return join(app.getPath('userData'), 'smart-paste-hotkey-binding.json');
}

async function loadPersistedBinding(): Promise<string | null> {
  try {
    const raw = JSON.parse(await fs.readFile(bindingPath(), 'utf8')) as { accelerator?: string | null };
    return raw.accelerator ?? null;
  } catch {
    return null;
  }
}

async function savePersistedBinding(): Promise<void> {
  await fs.writeFile(bindingPath(), JSON.stringify({ accelerator }), 'utf8');
}

function flush(): void {
  if (!receiver || receiver.isDestroyed() || !rendererReady) return;
  while (queue.length) receiver.webContents.send('dude:smartPaste:trigger', queue.shift());
}

function triggerFromClipboard(): void {
  const text = clipboard.readText();
  if (!text) return;

  const window = BrowserWindow.getAllWindows()[0];
  if (window) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  queue.push(text);
  flush();
}

/** Called from `createWindow()`, once a real window exists -- mirrors `registerOpenHandlers`. */
export function registerSmartPasteRenderer(window: BrowserWindow): void {
  receiver = window;
  ipcMain.on('dude:smartPaste:ready', () => {
    rendererReady = true;
    flush();
  });
  window.webContents.on('did-start-loading', () => {
    rendererReady = false;
  });
  window.on('closed', () => {
    receiver = null;
    rendererReady = false;
  });
}

/**
 * Restores a previously-bound hotkey on launch -- a binding that fails to register (another app
 * already owns that accelerator) is silently dropped in-memory, not from disk, so `getHotkey()`
 * correctly reports it as unbound and Settings can surface "couldn't register" and let the user
 * re-bind, mirroring `hotkey-bridge.ts#registerHotkeyHandlers`'s identical recovery behavior.
 */
export async function registerSmartPasteHotkey(): Promise<void> {
  const persisted = await loadPersistedBinding();
  if (persisted && globalShortcut.register(persisted, triggerFromClipboard)) {
    accelerator = persisted;
  }

  ipcMain.handle('dude:smartPaste:getHotkey', () => accelerator);

  ipcMain.handle(
    'dude:smartPaste:setHotkey',
    async (_event, next: string | null): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (accelerator) {
        globalShortcut.unregister(accelerator);
        accelerator = null;
      }

      if (!next) {
        await savePersistedBinding();
        return { ok: true };
      }

      if (!globalShortcut.register(next, triggerFromClipboard)) {
        return { ok: false, error: 'registration-failed' };
      }

      accelerator = next;
      await savePersistedBinding();
      return { ok: true };
    },
  );
}
