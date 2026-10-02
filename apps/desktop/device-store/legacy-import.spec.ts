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
  safeStorage: {
    available: true,
    isEncryptionAvailable() { return this.available; },
    // Reversible stand-in for the OS keychain: "ciphertext" is the reversed UTF-8 bytes behind a marker.
    decryptString(buffer: Buffer) { return Buffer.from(buffer.subarray(4)).reverse().toString('utf8'); },
  },
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

describe('importLegacySecureStore', () => {
  const enc = (value: string): string => Buffer.concat([Buffer.from('enc:'), Buffer.from(value, 'utf8').reverse()]).toString('base64');
  const legacyKey = (name: string): string => `dude:v1:settings:${name}`;

  it('copies the API key ciphertext unchanged, imports base URL and model into the ai-provider doc and moves the file', async () => {
    installStore();
    electron.safeStorage.available = true;
    const dir = userDataDir();
    // Not valid for the stand-in cipher on purpose: proves the key bytes are never decrypted or re-encrypted.
    const keyBytes = Uint8Array.from([0, 255, 7, 8, 9, 200, 1]);
    put(dir, 'secure-store.json', {
      [legacyKey('llmApiKey')]: Buffer.from(keyBytes).toString('base64'),
      [legacyKey('llmBaseUrl')]: enc('https://api.example.com/v1'),
      [legacyKey('llmModel')]: enc('gpt-test'),
      'dude:v1:other:thing': enc('unrelated'),
    });
    await importLegacyUserData(dir);

    expect(await storeCall('secrets.getCiphertext', { purpose: 'ai.llmApiKey' })).toEqual({ ciphertext: keyBytes });
    expect(await storeCall('docs.get', { name: 'ai-provider' })).toEqual({ baseUrl: 'https://api.example.com/v1', model: 'gpt-test' });
    expect(await storeCall('docs.get', { name: 'legacy-import-state' })).toMatchObject({ secureStore: true });
    expect(existsSync(join(dir, 'secure-store.json'))).toBe(false);
    const [run] = legacyRuns(dir);
    expect(readdirSync(join(dir, 'legacy-import', run))).toContain('secure-store.json');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('dude:v1:other:thing'));
    expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).not.toContain('unrelated');
  });

  it('still copies the key but skips base URL and model when safeStorage is unavailable', async () => {
    installStore();
    electron.safeStorage.available = false;
    const dir = userDataDir();
    put(dir, 'secure-store.json', { [legacyKey('llmApiKey')]: enc('sk-key'), [legacyKey('llmBaseUrl')]: enc('https://api.example.com/v1') });
    await importLegacyUserData(dir);
    electron.safeStorage.available = true;

    expect((await storeCall('secrets.status', { purpose: 'ai.llmApiKey' })).isSet).toBe(true);
    expect(await storeCall('docs.get', { name: 'ai-provider' })).toBeNull();
    expect(existsSync(join(dir, 'secure-store.json'))).toBe(false);
  });

  it('does not overwrite an existing ai-provider doc or an existing key', async () => {
    installStore();
    electron.safeStorage.available = true;
    const dir = userDataDir();
    await saveDoc('ai-provider', { baseUrl: 'https://mine.example/v1', model: 'mine' });
    await storeCall('secrets.set', { purpose: 'ai.llmApiKey', ciphertext: Uint8Array.from([1, 2, 3]) });
    put(dir, 'secure-store.json', { [legacyKey('llmApiKey')]: enc('sk-old'), [legacyKey('llmBaseUrl')]: enc('https://old.example/v1') });
    await importLegacyUserData(dir);

    expect(await storeCall('docs.get', { name: 'ai-provider' })).toEqual({ baseUrl: 'https://mine.example/v1', model: 'mine' });
    expect(await storeCall('secrets.getCiphertext', { purpose: 'ai.llmApiKey' })).toEqual({ ciphertext: Uint8Array.from([1, 2, 3]) });
  });

  it('leaves the file alone while the store is degraded', async () => {
    const dir = userDataDir();
    put(dir, 'secure-store.json', { [legacyKey('llmApiKey')]: enc('sk-key') });
    await importLegacyUserData(dir);
    expect(existsSync(join(dir, 'secure-store.json'))).toBe(true);
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
