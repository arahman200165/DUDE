import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { basename, isAbsolute, join, sep } from 'node:path';
import { normalizeRoot } from './fs-paths';
import type { FsResult, PickedFile, PickedSavePath, RememberedFolder, SaveFileFilter } from "@dude/contracts/fs/fs-types";
export { normalizeRoot, resolveInRoot, toPosixRelative } from './fs-paths';

/**
 * Filesystem grants (Phase 8 Stage 2, extended in Phase 29 / Milestone 523). A path only becomes
 * readable after the user picks it in a native OS dialog this session — or after they explicitly
 * asked DUDE to *remember* a picked folder, in which case it is re-granted on launch only if it
 * still exists. Remembered folders live in `userData/remembered-folders.json`, are listed and
 * revocable from Settings, and are the only roots background folder watching may use. A typed path
 * is never granted directly: it opens the picker pre-navigated there and the user confirms.
 */

const granted = new Set<string>();
let remembered: { path: string; name: string; addedAt: string }[] = [];
let rememberedLoaded = false;
const MAX_REMEMBERED = 50;

export function grantPath(path: string): string {
  const key = normalizeRoot(path);
  granted.add(key);
  return key;
}

// ---- Single-use save grants ----

const saveGrants = new Set<string>();
const MAX_SAVE_GRANTS = 16;
const saveKey = (path: string): string => normalizeRoot(path).toLowerCase();

/** A path the user just chose in the native *save* dialog: writable once, for that exact file only. */
export function grantSavePath(path: string): string {
  const key = saveKey(path);
  if (saveGrants.size >= MAX_SAVE_GRANTS) saveGrants.delete(saveGrants.values().next().value as string);
  saveGrants.add(key);
  return normalizeRoot(path);
}

/** Consumes the grant: true exactly once per save-dialog confirmation. */
export function consumeSavePath(path: unknown): path is string {
  return typeof path === 'string' && saveGrants.delete(saveKey(path));
}

/** A bare, safe file name for the dialog to pre-fill (never a directory or a reserved character). */
export function sanitizeDefaultName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 120);
}

export function sanitizeSaveFilters(filters: unknown): SaveFileFilter[] {
  if (!Array.isArray(filters)) return [];
  return filters.slice(0, 8).flatMap((item): SaveFileFilter[] => {
    const f = item as { name?: unknown; extensions?: unknown } | null;
    if (!f || typeof f.name !== 'string' || !Array.isArray(f.extensions)) return [];
    const extensions = f.extensions.filter((e): e is string => typeof e === 'string' && /^[A-Za-z0-9]{1,16}$/.test(e)).slice(0, 16);
    return extensions.length ? [{ name: f.name.slice(0, 80), extensions }] : [];
  });
}

export function isRootGranted(rootPath: unknown): rootPath is string {
  return typeof rootPath === 'string' && granted.has(normalizeRoot(rootPath));
}

/** Whether an absolute path lies inside (or is) one of the granted roots. */
export function isInsideGrantedRoot(absolute: string): boolean {
  const target = normalizeRoot(absolute).toLowerCase();
  for (const root of granted) {
    const key = root.toLowerCase();
    if (target === key || target.startsWith(key.endsWith(sep) ? key : key + sep)) return true;
  }
  return false;
}

// ---- Remembered folders ----

function rememberedPath(): string { return join(app.getPath('userData'), 'remembered-folders.json'); }

async function saveRemembered(): Promise<void> {
  const target = rememberedPath();
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, JSON.stringify(remembered, null, 2), 'utf8');
  await fs.rename(temp, target);
}

async function isDirectory(path: string): Promise<boolean> {
  try { return (await fs.stat(path)).isDirectory(); } catch { return false; }
}

/** Startup: re-grant every remembered folder that still exists. */
export async function loadRememberedGrants(): Promise<readonly RememberedFolder[]> {
  if (!rememberedLoaded) {
    try {
      const raw = JSON.parse(await fs.readFile(rememberedPath(), 'utf8')) as unknown;
      remembered = Array.isArray(raw)
        ? raw.filter((item): item is { path: string; name: string; addedAt: string } => !!item && typeof item.path === 'string' && isAbsolute(item.path)).slice(0, MAX_REMEMBERED)
        : [];
    } catch { remembered = []; }
    rememberedLoaded = true;
  }
  return listRemembered(true);
}

export async function listRemembered(regrant = false): Promise<readonly RememberedFolder[]> {
  return Promise.all(remembered.map(async (item) => {
    const available = await isDirectory(item.path);
    if (available && regrant) grantPath(item.path);
    return { ...item, available };
  }));
}

export function isRemembered(path: string): boolean {
  const key = normalizeRoot(path).toLowerCase();
  return remembered.some((item) => normalizeRoot(item.path).toLowerCase() === key);
}

export async function rememberRoot(path: unknown): Promise<FsResult<{ folders: readonly RememberedFolder[] }>> {
  if (!isRootGranted(path)) return { ok: false, error: 'Pick this folder with the native picker before remembering it.' };
  if (!(await isDirectory(path))) return { ok: false, error: 'Only folders can be remembered.' };
  if (!isRemembered(path)) {
    if (remembered.length >= MAX_REMEMBERED) return { ok: false, error: `At most ${MAX_REMEMBERED} folders can be remembered.` };
    const key = normalizeRoot(path);
    remembered.push({ path: key, name: basename(key) || key, addedAt: new Date().toISOString() });
    await saveRemembered();
  }
  return { ok: true, folders: await listRemembered() };
}

/** Forgetting revokes persistence only; the folder stays granted for the rest of this session. */
export async function forgetRoot(path: unknown): Promise<FsResult<{ folders: readonly RememberedFolder[] }>> {
  if (typeof path !== 'string') return { ok: false, error: 'invalid-path' };
  const key = normalizeRoot(path).toLowerCase();
  remembered = remembered.filter((item) => normalizeRoot(item.path).toLowerCase() !== key);
  await saveRemembered();
  for (const listener of forgetListeners) listener(normalizeRoot(path));
  return { ok: true, folders: await listRemembered() };
}

const forgetListeners: ((path: string) => void)[] = [];
/** Folder watching (Milestone 534) stops a background watch when its folder is forgotten. */
export function onRootForgotten(listener: (path: string) => void): void { forgetListeners.push(listener); }

// ---- Pickers ----

function ownerWindow(sender: Electron.WebContents): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(sender) ?? undefined;
}

export function registerGrantHandlers(): void {
  ipcMain.handle('dude:fs:pickDirectory', async (event, defaultPath?: unknown) => {
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory'], ...(typeof defaultPath === 'string' && isAbsolute(defaultPath) ? { defaultPath } : {}) };
    const window = ownerWindow(event.sender);
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const rootPath = grantPath(result.filePaths[0]);
    return { canceled: false, rootPath, rootName: basename(rootPath) || rootPath };
  });

  ipcMain.handle('dude:fs:pickFile', async (event, defaultPath?: unknown): Promise<{ canceled: true } | ({ canceled: false } & PickedFile)> => {
    const options: Electron.OpenDialogOptions = { properties: ['openFile'], ...(typeof defaultPath === 'string' && isAbsolute(defaultPath) ? { defaultPath } : {}) };
    const window = ownerWindow(event.sender);
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const path = grantPath(result.filePaths[0]);
    const info = await fs.stat(path);
    return { canceled: false, path, name: basename(path), size: info.size };
  });

  ipcMain.handle('dude:fs:pickSavePath', async (event, request?: unknown): Promise<PickedSavePath> => {
    const req = (request && typeof request === 'object' ? request : {}) as { defaultName?: unknown; filters?: unknown };
    const defaultName = sanitizeDefaultName(req.defaultName);
    const filters = sanitizeSaveFilters(req.filters).map((f) => ({ name: f.name, extensions: [...f.extensions] }));
    const options: Electron.SaveDialogOptions = { ...(defaultName ? { defaultPath: defaultName } : {}), ...(filters.length ? { filters } : {}), properties: ['showOverwriteConfirmation'] };
    const window = ownerWindow(event.sender);
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath || !isAbsolute(result.filePath)) return { canceled: true };
    const path = grantSavePath(result.filePath);
    return { canceled: false, path, name: basename(path) };
  });

  ipcMain.handle('dude:fs:listRemembered', () => listRemembered());
  ipcMain.handle('dude:fs:remember', (_event, path: unknown) => rememberRoot(path));
  ipcMain.handle('dude:fs:forget', (_event, path: unknown) => forgetRoot(path));
  ipcMain.handle('dude:fs:isGranted', (_event, path: unknown) => isRootGranted(path));
}
