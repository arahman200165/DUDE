const electron = vi.hoisted(() => ({
  app: { getPath: (): string => '', isPackaged: false },
  ipcMain: { handle: vi.fn() },
  shell: {},
  screen: {},
  nativeTheme: { themeSource: 'system' },
  globalShortcut: {},
  clipboard: {},
  BrowserWindow: class {},
  dialog: {},
  Notification: class {},
  powerMonitor: { on: vi.fn() },
}));
vi.mock('electron', () => electron);

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTemp, openReady, tempDir } from '../../device-agent/src/testing/test-utils';
import { createRpcServer } from '../../device-agent/src/rpc/server';
import { createInProcessClient, setDeviceStoreHost, storeCall } from './store-client';
import { loadDoc, resetDeviceDocsForTesting, saveDoc } from './device-docs';
import { importLegacyUserData } from './legacy-import';
import { DEFAULT_NATIVE_APPEARANCE, loadNativeAppearance } from '../appearance-bridge';
import { decodeRememberedFolders, loadRememberedGrants } from '../fs-grants';
import { decodeWindowBounds } from '../window-state';

const deps = { now: () => new Date(), randomBytes: (n: number) => new Uint8Array(randomBytes(n)) };
function installStore(): void {
  const store = openReady(tempDir(), { machineGuid: null });
  setDeviceStoreHost(createInProcessClient(createRpcServer(store, deps).handle));
}
const dirs: string[] = [];
function userDataDir(): string { const dir = mkdtempSync(join(tmpdir(), 'dude-legacy-')); dirs.push(dir); return dir; }
const put = (dir: string, name: string, value: unknown): void => writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
const legacyRuns = (dir: string): string[] => (existsSync(join(dir, 'legacy-import')) ? readdirSync(join(dir, 'legacy-import')) : []);

beforeEach(() => { resetDeviceDocsForTesting(); vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => {
  setDeviceStoreHost(null); cleanupTemp(); vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('importLegacyUserData', () => {
  it('imports valid files, skips invalid ones and moves everything to legacy-import/<ts>/', async () => {
    installStore();
    const dir = userDataDir();
    put(dir, 'desktop-preferences.json', { closeToTray: false, updateMode: 'manual', lastInstallerRequest: 'x' });
    put(dir, 'native-appearance.json', { mode: 'light', background: '#ffffff' });
    put(dir, 'window-bounds.json', { x: 1, y: 2 });
    put(dir, 'hotkey-bindings.json', { 'uuid-generate-clipboard': 'Ctrl+Alt+U', bad: 5 });
    put(dir, 'sys-mutation-settings.json', { retentionDays: 9999, maxBackupBytes: 5 });
    put(dir, 'watched-folders.json', 'not json{');
    await importLegacyUserData(dir);

    expect(await storeCall('docs.get', { name: 'desktop-preferences' })).toMatchObject({ closeToTray: false, updateMode: 'manual', lastInstallerRequest: 'x' });
    expect(await storeCall('docs.get', { name: 'native-appearance' })).toEqual({ mode: 'light', background: '#ffffff' });
    expect(await storeCall('docs.get', { name: 'hotkey-bindings' })).toEqual({ 'uuid-generate-clipboard': 'Ctrl+Alt+U' });
    expect(await storeCall('docs.get', { name: 'sys-mutation-settings' })).toMatchObject({ retentionDays: 3650, maxBackupBytes: 5 });
    expect(await storeCall('docs.get', { name: 'window-bounds' })).toBeNull();
    expect(await storeCall('docs.get', { name: 'watched-folders' })).toBeNull();
    expect(await storeCall('docs.get', { name: 'legacy-import-state' })).toMatchObject({ userData: true });

    const [run] = legacyRuns(dir);
    expect(legacyRuns(dir)).toHaveLength(1);
    expect(run).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
    expect(readdirSync(join(dir, 'legacy-import', run)).sort()).toEqual(['desktop-preferences.json', 'hotkey-bindings.json', 'native-appearance.json', 'sys-mutation-settings.json', 'watched-folders.json', 'window-bounds.json']);
    expect(existsSync(join(dir, 'desktop-preferences.json'))).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, 'legacy-import', run, 'desktop-preferences.json'), 'utf8')).updateMode).toBe('manual');
  });

  it('does not overwrite an existing doc', async () => {
    installStore();
    const dir = userDataDir();
    await saveDoc('native-appearance', { mode: 'dark', background: '#000000' });
    put(dir, 'native-appearance.json', { mode: 'light', background: '#ffffff' });
    await importLegacyUserData(dir);
    expect(await storeCall('docs.get', { name: 'native-appearance' })).toEqual({ mode: 'dark', background: '#000000' });
  });

  it('is a no-op on a rerun with nothing left to move', async () => {
    installStore();
    const dir = userDataDir();
    put(dir, 'window-bounds.json', { x: 0, y: 0, width: 800, height: 600 });
    await importLegacyUserData(dir);
    await importLegacyUserData(dir);
    expect(legacyRuns(dir)).toHaveLength(1);
    expect(await storeCall('docs.get', { name: 'window-bounds' })).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('only moves leftover files when the flag is already set (crash between commit and move)', async () => {
    installStore();
    const dir = userDataDir();
    await saveDoc('legacy-import-state', { userData: true });
    await saveDoc('window-bounds', { x: 5, y: 5, width: 900, height: 700 });
    put(dir, 'window-bounds.json', { x: 0, y: 0, width: 800, height: 600 });
    await importLegacyUserData(dir);
    expect(existsSync(join(dir, 'window-bounds.json'))).toBe(false);
    expect(legacyRuns(dir)).toHaveLength(1);
    expect(await storeCall('docs.get', { name: 'window-bounds' })).toEqual({ x: 5, y: 5, width: 900, height: 700 });
  });

  it('does nothing while the store is degraded', async () => {
    const dir = userDataDir();
    put(dir, 'window-bounds.json', { x: 0, y: 0, width: 800, height: 600 });
    await importLegacyUserData(dir);
    expect(existsSync(join(dir, 'window-bounds.json'))).toBe(true);
    expect(legacyRuns(dir)).toHaveLength(0);
  });
});

describe('converted modules over device docs', () => {
  it('round-trips native appearance through the store and falls back to defaults when absent', async () => {
    installStore();
    expect(await loadNativeAppearance()).toEqual(DEFAULT_NATIVE_APPEARANCE);
    await saveDoc('native-appearance', { mode: 'light', background: '#ffffff' });
    expect(await loadNativeAppearance()).toEqual({ mode: 'light', background: '#ffffff' });
  });

  it('keeps defaults in memory while degraded', async () => {
    expect(await loadNativeAppearance()).toEqual(DEFAULT_NATIVE_APPEARANCE);
    await saveDoc('native-appearance', { mode: 'light', background: '#ffffff' });
    expect((await loadNativeAppearance()).mode).toBe('light');
  });

  it('loads remembered folders from the store and rejects relative paths', async () => {
    installStore();
    const abs = tmpdir();
    await saveDoc('remembered-folders', [{ path: abs, name: 'tmp', addedAt: 'x' }, { path: 'relative', name: 'r', addedAt: 'x' }]);
    expect(decodeRememberedFolders(await storeCall('docs.get', { name: 'remembered-folders' }))).toHaveLength(1);
    expect((await loadRememberedGrants()).map((f) => f.path)).toEqual([abs]);
  });

  it('decodes window bounds strictly', async () => {
    expect(decodeWindowBounds({ x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(decodeWindowBounds({ x: 1 })).toBeNull();
    expect(await loadDoc('window-bounds', decodeWindowBounds, null)).toBeNull();
    mkdirSync(tmpdir(), { recursive: true });
  });
});
