import { app, BrowserWindow } from 'electron';
import { join, resolve } from 'node:path';
import { startStaticServer } from './static-server';
import { registerFsHandlers } from './fs-bridge';
import { registerSecretsHandlers } from './secrets-bridge';
import { registerLlmHandlers } from './llm-bridge';
import { createTray, isAppQuitting, registerShellChromeHandlers } from './tray';
import { registerHotkeyHandlers, unregisterAllHotkeys } from './hotkey-bridge';
import { registerSmartPasteHotkey, registerSmartPasteRenderer } from './smart-paste-hotkey';
import { registerNotificationHandlers } from './notifications-bridge';
import { closeAllFileWatches, registerFileWatchHandlers } from './file-watch-bridge';
import { registerCollabHandlers, stopCollabServerOnQuit } from './collab-bridge';
import { checkForUpdatesOnStartup, registerUpdateHandlers } from './update-bridge';
import { getDesktopPreferences, loadDesktopPreferences, registerDesktopPreferencesHandlers } from './desktop-preferences';
import { initialWindowBounds, trackWindowBounds } from './window-state';
import { enqueueCommandLine, registerOpenHandlers } from './open-bridge';
import { enqueueDeepLinkArguments, extractDeepLinkArgument, registerDeepLinkHandlers } from './deep-link-bridge';
import { registerNativeMenu } from './native-menu';
import { registerQuickLauncherHotkey, registerQuickLauncherRenderer } from './quick-launcher';

const DEV_SERVER_URL = process.env['DUDE_ELECTRON_DEV_SERVER_URL'];

async function resolveWindowUrl(): Promise<string> {
  if (DEV_SERVER_URL) {
    return DEV_SERVER_URL;
  }
  // `__dirname` here is always `dist/electron` (esbuild's outdir), sibling to
  // `dist/dude/browser` — not `app.getAppPath()`, which resolves to the
  // entry script's own directory (not the repo root) when Electron is
  // launched with a direct file path (`electron dist/electron/main.js`)
  // rather than a project directory.
  const browserDistRoot = join(__dirname, '../dude/browser');
  const { port } = await startStaticServer(browserDistRoot);
  return `http://127.0.0.1:${port}/`;
}

async function createWindow(): Promise<void> {
  const preferences = getDesktopPreferences();
  const bounds = await initialWindowBounds();
  const window = new BrowserWindow({
    ...bounds,
    show: !preferences.launchMinimized || process.argv.includes('--open-with-dude') || !!extractDeepLinkArgument(process.argv),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Stage 5: closing the window hides it to the tray instead of quitting —
  // `isAppQuitting()` (set via `before-quit`) is what allows a real close.
  window.on('close', (event) => {
    if (!isAppQuitting() && getDesktopPreferences().closeToTray) {
      event.preventDefault();
      window.hide();
    }
  });

  createTray(window);
  trackWindowBounds(window);
  registerDesktopPreferencesHandlers(window);
  registerOpenHandlers(window);
  registerDeepLinkHandlers(window);
  registerSmartPasteRenderer(window);
  registerUpdateHandlers(window);
  registerNativeMenu(window);
  registerQuickLauncherRenderer(window);

  const baseUrl = await resolveWindowUrl();
  const destination = preferences.startupDestination === 'workspace' ? 'workspace' : '';
  await window.loadURL(new URL(destination, baseUrl).toString());
  checkForUpdatesOnStartup();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else {
  app.on('second-instance', (_event, args) => {
    enqueueCommandLine(args);
    enqueueDeepLinkArguments(args);
    const window = BrowserWindow.getAllWindows()[0];
    if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  });
}

if (hasSingleInstanceLock) void app.whenReady().then(async () => {
  await loadDesktopPreferences();
  enqueueCommandLine(process.argv);
  enqueueDeepLinkArguments(process.argv);
  if (!app.isPackaged && process.argv[1]) {
    app.setAsDefaultProtocolClient('dude', process.execPath, [resolve(process.argv[1])]);
  }
  registerFsHandlers();
  registerSecretsHandlers();
  registerLlmHandlers();
  registerShellChromeHandlers();
  registerNotificationHandlers();
  registerFileWatchHandlers();
  registerCollabHandlers();
  await registerHotkeyHandlers();
  await registerSmartPasteHotkey();
  await registerQuickLauncherHotkey();
  return createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  unregisterAllHotkeys();
  closeAllFileWatches();
  stopCollabServerOnQuit();
});
