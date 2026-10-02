import { app, BrowserWindow } from 'electron';
import './engine-host.adapter';
import { join, resolve } from 'node:path';
import { APP_BASE_URL, installAppProtocol, registerAppSchemePrivileges } from './app-protocol';
import { registerFsHandlers } from './fs-bridge';
import { loadRememberedGrants } from './fs-grants';
import { registerFsJobHandlers, stopFsWorker } from './fs-jobs-bridge';
import { registerMutationHandlers } from './fs-mutation';
import { registerSnapshotHandlers } from './fs-snapshots';
import { loadFolderWatches, registerFolderWatchHandlers, setFolderWatchTrayUpdater, stopFolderWatches } from './fs-watch-service';
import { registerNetworkHandlers, cancelAllNetworkJobs } from './network-bridge';
import { registerSysHandlers } from './sys-bridge';
import { cancelAllPowerShellRuns, registerPowerShellWorkbenchHandlers } from './powershell-workbench';
import { registerSysMutationHandlers } from './sys-mutation';
import { cancelAllBundles, registerSysBundleHandlers } from './sys-bundle';
import { registerRuntimeProbeHandlers } from './runtime-probe';
import { registerSysSnapshotHandlers } from './sys-snapshots';
import { registerElevationHandlers } from './elevation-bridge';
import { stopSysHelper } from './sys-helper';
import { registerWatchHandlers, stopWatchScheduler, setTrayUpdater } from './network-watch';
import { updateFolderWatchTray, updateWatchTray } from './tray';
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
import { registerExternalLinkHandlers } from './external-link-bridge';
import { applyNativeThemeSource, loadNativeAppearance, registerAppearanceBridge } from './appearance-bridge';
import { registerNativeMenu } from './native-menu';
import { registerQuickLauncherHotkey, registerQuickLauncherRenderer } from './quick-launcher';
import { isAllowedRendererNavigation } from './navigation-guard';
import { checkAndMarkLaunch, markCleanExit } from './crash-detection';
import { currentAppInfo, deviceCapabilities, startDeviceAgent } from './device-store/agent-host';
import { readMachineGuid } from './device-store/machine-fingerprint';
import { installQuitCoordinator } from './device-store/quit-coordinator';
import { getDeviceStoreHost, setDeviceStoreHost } from './device-store/store-client';
import { startStoreMaintenance } from './device-store/store-maintenance';
import { importLegacyUserData } from './device-store/legacy-import';
import { registerDeviceStoreHandlers } from './device-store/store-bridge';
import { markPerf } from './perf-log';

// Must run before app ready: the privileged scheme gives the renderer a stable secure origin.
registerAppSchemePrivileges();

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
  installAppProtocol(browserDistRoot);
  return APP_BASE_URL;
}

async function createWindow(wasRestoredAfterCrash: boolean): Promise<void> {
  markPerf('createWindow-start');
  const preferences = getDesktopPreferences();
  // Neither depends on the other -- start both now instead of waiting on bounds resolution
  // (reads window-bounds.json + queries connected displays) before even installing the app
  // protocol, since window construction below only ever needs `bounds`.
  const boundsPromise = initialWindowBounds();
  const baseUrlPromise = resolveWindowUrl();
  const nativeAppearancePromise = loadNativeAppearance();
  const bounds = await boundsPromise;
  const nativeAppearance = await nativeAppearancePromise;
  applyNativeThemeSource(nativeAppearance);
  markPerf('bounds-resolved');
  const shouldShowOnLaunch =
    !preferences.launchMinimized || process.argv.includes('--open-with-dude') || !!extractDeepLinkArgument(process.argv);
  const window = new BrowserWindow({
    ...bounds,
    backgroundColor: nativeAppearance.background,
    // Created hidden and shown on 'ready-to-show' below instead of showing immediately, so the
    // window never displays a blank/white frame before its first real paint.
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A static, preload-computed flag (Phase 25 Item 6) -- passed this way (not IPC) so it's
      // known synchronously at preload time, the same way `platform.isDesktop` already is.
      additionalArguments: [`--dude-was-restored-after-crash=${wasRestoredAfterCrash}`],
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

  window.once('ready-to-show', () => {
    markPerf('ready-to-show');
    if (shouldShowOnLaunch) window.show();
  });

  createTray(window);
  setTrayUpdater(updateWatchTray);
  setFolderWatchTrayUpdater(updateFolderWatchTray);
  trackWindowBounds(window);
  registerDesktopPreferencesHandlers(window);
  registerOpenHandlers(window);
  registerDeepLinkHandlers(window);
  registerExternalLinkHandlers(window);
  registerDeviceStoreHandlers(window);
  registerLlmHandlers(window);
  registerAppearanceBridge(window);
  registerSmartPasteRenderer(window);
  registerUpdateHandlers(window);
  registerNativeMenu(window);
  registerQuickLauncherRenderer(window);

  markPerf('window-constructed');
  const baseUrl = await baseUrlPromise;
  markPerf('app-protocol-ready');
  window.webContents.on('will-navigate', (event, target) => {
    if (!isAllowedRendererNavigation(target, baseUrl)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const destination = preferences.startupDestination === 'workspace' ? 'workspace' : '';
  await window.loadURL(new URL(destination, baseUrl).toString());
  markPerf('load-url-done');
  checkForUpdatesOnStartup();
}

/**
 * Starts the Device State Store first so everything after it can use it. Bounded: a store that
 * fails or stalls never blocks the app, it just starts degraded (the host reports its status).
 */
async function startDeviceStore(): Promise<void> {
  try {
    const machineGuid = await readMachineGuid();
    const host = await startDeviceAgent({
      userDataDir: app.getPath('userData'),
      appInfo: currentAppInfo(),
      capabilities: deviceCapabilities(),
      machineGuid,
    });
    setDeviceStoreHost(host);
  } catch {
    setDeviceStoreHost(null);
  }
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

// Orderly quit: renderer flush, clean-exit marker, store checkpoint, then the real quit. Not for a
// second instance that is about to exit: it must not touch the first instance's markers.
if (hasSingleInstanceLock) {
  installQuitCoordinator({
    app,
    getWindow: () => BrowserWindow.getAllWindows()[0] ?? null,
    host: getDeviceStoreHost,
    markCleanExit,
  });
}

if (hasSingleInstanceLock) void app.whenReady().then(async () => {
  markPerf('app-ready');
  await startDeviceStore();
  markPerf('device-store-started');
  await importLegacyUserData(app.getPath('userData'));
  startStoreMaintenance();
  await loadDesktopPreferences();
  markPerf('preferences-loaded');
  const wasRestoredAfterCrash = await checkAndMarkLaunch();
  enqueueCommandLine(process.argv);
  enqueueDeepLinkArguments(process.argv);
  if (!app.isPackaged && process.argv[1]) {
    app.setAsDefaultProtocolClient('dude', process.execPath, [resolve(process.argv[1])]);
  }
  registerFsHandlers();
  registerFsJobHandlers();
  registerMutationHandlers();
  registerSnapshotHandlers();
  registerFolderWatchHandlers();
  await loadRememberedGrants();
  void loadFolderWatches();
  registerNetworkHandlers();
  registerSysHandlers();
  registerSysMutationHandlers();
  registerSysBundleHandlers();
  registerPowerShellWorkbenchHandlers();
  registerSysSnapshotHandlers();
  registerRuntimeProbeHandlers();
  registerElevationHandlers();
  registerWatchHandlers();
  registerSecretsHandlers();
  registerShellChromeHandlers();
  registerNotificationHandlers();
  registerFileWatchHandlers();
  registerCollabHandlers();
  // None of these three hotkey registrations depend on the window, and createWindow() doesn't
  // depend on them either -- run all four concurrently instead of blocking window creation on
  // hotkey setup finishing first.
  await Promise.all([
    registerHotkeyHandlers().then(() => markPerf('quick-actions-hotkeys-registered')),
    registerSmartPasteHotkey().then(() => markPerf('smart-paste-hotkey-registered')),
    registerQuickLauncherHotkey().then(() => markPerf('quick-launcher-hotkey-registered')),
    createWindow(wasRestoredAfterCrash),
  ]);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  unregisterAllHotkeys();
  closeAllFileWatches();
  stopFsWorker();
  stopFolderWatches();
  cancelAllNetworkJobs();
  cancelAllBundles();
  stopSysHelper();
  cancelAllPowerShellRuns();
  stopWatchScheduler();
  stopCollabServerOnQuit();
});
