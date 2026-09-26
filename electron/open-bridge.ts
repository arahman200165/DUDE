import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { grantExternalDirectory } from './fs-bridge';

const TEXT_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.xml', '.csv', '.md', '.txt', '.toml', '.ini', '.sql', '.js', '.ts', '.html', '.css']);
const MAX_TEXT_BYTES = 10 * 1024 * 1024;
type OpenItem =
  | { kind: 'file'; path: string; name: string; extension: string; text: string }
  | { kind: 'directory'; path: string; name: string }
  | { kind: 'error'; path: string; message: string };

let receiver: BrowserWindow | null = null;
let rendererReady = false;
const queue: OpenItem[] = [];

export async function enqueueOpenPath(path: string): Promise<void> {
  if (!isAbsolute(path)) return;
  let item: OpenItem;
  try {
    const stat = await fs.stat(path);
    if (stat.isDirectory()) { grantExternalDirectory(path); item = { kind: 'directory', path, name: basename(path) }; }
    else if (!stat.isFile()) item = { kind: 'error', path, message: 'This item is not a regular file or folder.' };
    else {
      const extension = extname(path).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension)) item = { kind: 'error', path, message: 'DUDE does not support this file type.' };
      else if (stat.size > MAX_TEXT_BYTES) item = { kind: 'error', path, message: 'This text file exceeds the 10 MiB opening limit.' };
      else {
        const bytes = await fs.readFile(path);
        item = { kind: 'file', path, name: basename(path), extension, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
      }
    }
  } catch (error) { item = { kind: 'error', path, message: error instanceof Error ? error.message : 'Could not open this item.' }; }
  queue.push(item);
  flush();
}

export function enqueueCommandLine(args: readonly string[]): void {
  const flag = args.indexOf('--open-with-dude');
  if (flag >= 0 && args[flag + 1]) void enqueueOpenPath(args[flag + 1]);
}

function flush(): void {
  if (!receiver || receiver.isDestroyed() || !rendererReady) return;
  while (queue.length) receiver.webContents.send('dude:open:item', queue.shift());
}

/** Uses the OS picker, then the same bounded file-opening path as Explorer associations. */
export async function pickOpenFile(window: BrowserWindow): Promise<{ readonly canceled: boolean }> {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [{ name: 'Supported text files', extensions: [...TEXT_EXTENSIONS].map((extension) => extension.slice(1)) }],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  await enqueueOpenPath(result.filePaths[0]);
  return { canceled: false };
}

export function registerOpenHandlers(window: BrowserWindow): void {
  receiver = window;
  ipcMain.on('dude:open:ready', () => { rendererReady = true; flush(); });
  ipcMain.handle('dude:open:pickFile', () => pickOpenFile(window));
  ipcMain.handle('dude:open:enqueuePath', async (event, value: unknown) => {
    if (event.sender !== window.webContents) return { ok: false, error: 'unauthorized' };
    if (typeof value !== 'string' || !value || value.length > 4096 || !isAbsolute(value)) return { ok: false, error: 'invalid-path' };
    try {
      if (!(await fs.stat(value)).isDirectory()) return { ok: false, error: 'not-a-directory' };
      await enqueueOpenPath(value);
      return { ok: true };
    } catch { return { ok: false, error: 'directory-unavailable' }; }
  });
  window.webContents.on('did-start-loading', () => { rendererReady = false; });
  window.on('closed', () => { receiver = null; rendererReady = false; });
  ipcMain.handle('dude:preferences:setupRequest', async () => {
    if (!app.isPackaged) return null;
    try {
      const marker = await fs.readFile(join(dirname(app.getPath('exe')), 'setup-request.ini'), 'utf8');
      return marker.trim() || null;
    } catch { return null; }
  });
}
