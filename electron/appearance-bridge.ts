import { app, ipcMain, nativeTheme, type BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import tokens from '../src/styles/theme/theme-tokens.json';

export type NativeAppearanceMode = 'dark' | 'light';
export interface NativeAppearance { readonly mode: NativeAppearanceMode; readonly background: string }
export type AppearanceSetResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** Default window background before the renderer reports one: `bases.dark.standard.bg` in theme-tokens.json. */
export const DEFAULT_NATIVE_APPEARANCE: NativeAppearance = {
  mode: 'dark',
  background: (tokens as { bases: { dark: { standard: { bg: string } } } }).bases.dark.standard.bg,
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Strict validation: a plain object with exactly `mode` and `background`. Anything else is null. */
export function parseNativeAppearance(value: unknown): NativeAppearance | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('mode') || !keys.includes('background')) return null;
  const { mode, background } = value as Record<string, unknown>;
  if (mode !== 'dark' && mode !== 'light') return null;
  if (typeof background !== 'string' || !HEX_COLOR.test(background)) return null;
  return { mode, background };
}

interface ThemeTarget { themeSource: 'system' | 'light' | 'dark' }

export interface AppearanceBridgeDeps {
  readonly nativeTheme?: ThemeTarget;
  readonly persist?: (appearance: NativeAppearance) => void | Promise<void>;
}

function storePath(): string { return join(app.getPath('userData'), 'native-appearance.json'); }

/** Last good appearance from disk (or the dark default). Call before creating the window. */
export async function loadNativeAppearance(): Promise<NativeAppearance> {
  try {
    return parseNativeAppearance(JSON.parse(await fs.readFile(storePath(), 'utf8'))) ?? DEFAULT_NATIVE_APPEARANCE;
  } catch {
    return DEFAULT_NATIVE_APPEARANCE;
  }
}

/** Applies the native theme source before any window paints, so there is no light/dark flash. */
export function applyNativeThemeSource(appearance: NativeAppearance, target: ThemeTarget = nativeTheme): void {
  target.themeSource = appearance.mode;
}

async function persistToDisk(appearance: NativeAppearance): Promise<void> {
  await fs.writeFile(storePath(), JSON.stringify(appearance), 'utf8');
}

/**
 * `dude:appearance:set` -- syncs Electron's native theme (title bar, menus, scrollbars) and the
 * window background with the renderer's resolved appearance. Main validates the payload and only
 * accepts requests from this window's own webContents. The last good pair is persisted so the next
 * launch creates the window with the right background before the renderer loads.
 */
export function registerAppearanceBridge(window: BrowserWindow, deps: AppearanceBridgeDeps = {}): void {
  const theme = deps.nativeTheme ?? nativeTheme;
  const persist = deps.persist ?? persistToDisk;
  ipcMain.handle('dude:appearance:set', async (event, payload: unknown): Promise<AppearanceSetResult> => {
    if (event.sender !== window.webContents) return { ok: false, error: 'Request rejected.' };
    const appearance = parseNativeAppearance(payload);
    if (!appearance) return { ok: false, error: 'invalid appearance' };
    theme.themeSource = appearance.mode;
    window.setBackgroundColor(appearance.background);
    try { await persist(appearance); } catch { /* Persistence is best-effort; the live sync already applied. */ }
    return { ok: true };
  });
}
