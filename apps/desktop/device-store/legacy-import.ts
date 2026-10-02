import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { decodeDesktopPreferencesDoc } from '../desktop-preferences';
import { decodeWindowBounds } from '../window-state';
import { parseNativeAppearance } from '../appearance-bridge';
import { decodeHotkeyBindings } from '../hotkey-bridge';
import { decodeQuickLauncherBinding } from '../quick-launcher';
import { decodeSmartPasteBinding } from '../smart-paste-hotkey';
import { decodeRememberedFolders } from '../fs-grants';
import { decodeWatchedFoldersDoc } from '../fs-watch-service';
import { decodeCertificateWatchDoc } from '../network-watch';
import { sanitizeSettings } from '../fs-mutation';
import { sanitizeSysSettings } from '../sys-mutation';
import { loadDoc, saveDoc } from './device-docs';
import { isDeviceStoreReady, storeCall } from './store-client';

/**
 * One-shot, best-effort import of the pre-31B JSON files under userData into device docs. Each file
 * is decoded with its owning module's own parser (invalid -> skipped), docs that already exist are
 * never overwritten, and once the docs are committed the flag `legacy-import-state.userData` is set
 * and the files are moved to `userData/legacy-import/<timestamp>/` (also the untouched recovery copy).
 * Resumable: with the flag set, any leftover legacy file (a crash between commit and move) is only moved.
 */
export interface LegacyFile {
  readonly file: string;
  readonly doc: string;
  readonly decode: (raw: unknown) => unknown;
}

const objectOnly = <T>(decode: (raw: unknown) => T) => (raw: unknown): T | null =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? decode(raw) : null;

export const LEGACY_FILES: readonly LegacyFile[] = [
  { file: 'desktop-preferences.json', doc: 'desktop-preferences', decode: decodeDesktopPreferencesDoc },
  { file: 'window-bounds.json', doc: 'window-bounds', decode: decodeWindowBounds },
  { file: 'native-appearance.json', doc: 'native-appearance', decode: parseNativeAppearance },
  { file: 'hotkey-bindings.json', doc: 'hotkey-bindings', decode: decodeHotkeyBindings },
  { file: 'quick-launcher-hotkey-binding.json', doc: 'quick-launcher-hotkey', decode: decodeQuickLauncherBinding },
  { file: 'smart-paste-hotkey-binding.json', doc: 'smart-paste-hotkey', decode: decodeSmartPasteBinding },
  { file: 'remembered-folders.json', doc: 'remembered-folders', decode: decodeRememberedFolders },
  { file: 'watched-folders.json', doc: 'watched-folders', decode: decodeWatchedFoldersDoc },
  { file: 'certificate-watch-list.json', doc: 'certificate-watch-list', decode: decodeCertificateWatchDoc },
  { file: 'fs-mutation-settings.json', doc: 'fs-mutation-settings', decode: objectOnly(sanitizeSettings) },
  { file: 'sys-mutation-settings.json', doc: 'sys-mutation-settings', decode: objectOnly(sanitizeSysSettings) },
];

const STATE_DOC = 'legacy-import-state';
type ImportState = Record<string, unknown>;
const decodeState = (raw: unknown): ImportState | null => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as ImportState : null);

async function exists(path: string): Promise<boolean> {
  try { await fs.access(path); return true; } catch { return false; }
}

async function moveFile(from: string, to: string): Promise<void> {
  try { await fs.rename(from, to); return; } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EXDEV' && code !== 'EPERM') { console.warn(`[legacy-import] could not move ${from}:`, (error as Error).message); return; }
  }
  try { await fs.copyFile(from, to); await fs.unlink(from); } catch (error) {
    console.warn(`[legacy-import] could not move ${from}:`, (error as Error).message);
  }
}

async function moveLegacyFiles(userData: string, names: readonly string[]): Promise<void> {
  if (!names.length) return;
  const folder = join(userData, 'legacy-import', new Date().toISOString().replace(/[:.]/g, '-'));
  try { await fs.mkdir(folder, { recursive: true }); } catch (error) { console.warn('[legacy-import] could not create the recovery folder:', (error as Error).message); return; }
  for (const name of names) await moveFile(join(userData, name), join(folder, name));
}

async function runImport(userData: string): Promise<void> {
  const state = await loadDoc<ImportState>(STATE_DOC, decodeState, {});
  const present: LegacyFile[] = [];
  for (const entry of LEGACY_FILES) if (await exists(join(userData, entry.file))) present.push(entry);

  if (state['userData'] !== true) {
    let failed = false;
    for (const entry of present) {
      try {
        if ((await storeCall('docs.get', { name: entry.doc })) !== null) continue;
        const decoded = entry.decode(JSON.parse(await fs.readFile(join(userData, entry.file), 'utf8')));
        if (decoded === null || decoded === undefined) { console.warn(`[legacy-import] skipped ${entry.file}: not a valid document.`); continue; }
        await storeCall('docs.set', { name: entry.doc, value: decoded });
      } catch (error) {
        if (error instanceof SyntaxError) { console.warn(`[legacy-import] skipped ${entry.file}: not valid JSON.`); continue; }
        failed = true;
        console.warn(`[legacy-import] could not import ${entry.file}:`, error instanceof Error ? error.message : error);
      }
    }
    if (failed) return; // Retry on the next healthy start; nothing is moved yet.
    await saveDoc(STATE_DOC, { ...state, userData: true, userDataAt: new Date().toISOString() });
    if (!isDeviceStoreReady()) return; // The flag landed in memory only: keep the files.
  }
  await moveLegacyFiles(userData, present.map((entry) => entry.file));
}

let inFlight: Promise<void> | null = null;

export function importLegacyUserData(userData: string): Promise<void> {
  if (!isDeviceStoreReady()) return Promise.resolve();
  if (!inFlight) inFlight = runImport(userData).catch((error) => { console.error('[legacy-import] failed:', error instanceof Error ? error.message : error); }).finally(() => { inFlight = null; });
  return inFlight;
}
