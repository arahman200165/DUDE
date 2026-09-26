import type { DudeElectronBridge } from '../electron-bridge';

/**
 * A full `DudeElectronBridge` stub with a sensible "nothing configured yet"
 * default for every member, for specs that need `window.dude` present.
 * Pass `overrides` for the parts the test actually cares about — this way
 * a spec file doesn't need to restate every bridge member just to satisfy
 * the type whenever a new one is added.
 */
export function fakeElectronBridge(overrides: Partial<DudeElectronBridge> = {}): DudeElectronBridge {
  return {
    platform: { isDesktop: true },
    deepLink: { ready: () => {}, onItem: () => () => {} },
    menu: { ready: () => {}, onAction: () => () => {}, setToolMenuData: async () => ({ ok: true }) },
    quickLauncher: { ready: () => {}, onOpen: () => () => {}, onDismissed: () => () => {}, dismiss: async () => ({ ok: true }), promote: async () => ({ ok: true }), getHotkey: async () => null, setHotkey: async () => ({ ok: true }) },
    preferences: { get: async () => ({ closeToTray: true, launchMinimized: false, startupDestination: 'workspace', preferredDisplayId: null, rememberWindowBounds: true, updateMode: 'auto-download', notifyUpdates: true, notifyCollaboration: true }), set: async () => ({ ok: true, value: { closeToTray: true, launchMinimized: false, startupDestination: 'workspace', preferredDisplayId: null, rememberWindowBounds: true, updateMode: 'auto-download', notifyUpdates: true, notifyCollaboration: true } }), displays: async () => [], setupRequest: async () => null },
    open: { ready: () => {}, pickFile: async () => ({ canceled: true }), getPathForFile: () => '', enqueuePath: async () => ({ ok: true }), reopen: async () => ({ ok: true }), onItem: () => () => {} },
    fs: {
      pickDirectory: async () => ({ canceled: true }),
      walk: async () => ({ ok: true, entries: [] }),
      readFile: async () => ({ ok: true, data: new ArrayBuffer(0) }),
      readdir: async () => ({ ok: true, names: [] }),
      stat: async () => ({ ok: true, stat: { isFile: false, isDirectory: true, isSymbolicLink: false, size: 0, mtimeMs: 0 } }),
    },
    secrets: {
      get: async () => ({ ok: true, value: null }),
      set: async () => ({ ok: true }),
      remove: async () => ({ ok: true }),
    },
    llm: {
      isConfigured: async () => false,
      getEndpoint: async () => ({ ok: false, error: 'not-configured' }),
    },
    shell: {
      getLaunchOnLogin: async () => false,
      setLaunchOnLogin: async () => ({ ok: true }),
      openDefaultApps: async () => ({ ok: true }),
      getFileAssociations: async () => null,
    },
    quickActions: {
      list: async () => [],
      run: async () => ({ ok: true }),
      setHotkey: async () => ({ ok: true }),
    },
    smartPaste: {
      ready: () => {},
      onTrigger: () => () => {},
      getHotkey: async () => null,
      setHotkey: async () => ({ ok: true }),
    },
    notifications: {
      show: async () => ({ ok: true }),
    },
    fileWatch: {
      watch: async () => ({ ok: true, watchId: 'watch-1' }),
      unwatch: async () => ({ ok: true }),
      onEvent: () => () => {},
    },
    collab: {
      startSession: async () => ({ ok: true, url: 'ws://127.0.0.1:1234', sessionCode: 'abcdef' }),
      stopSession: async () => ({ ok: true }),
      participantCount: async () => 0,
    },
    update: {
      checkForUpdates: async () => ({ ok: true }),
      quitAndInstall: async () => ({ ok: true }),
      downloadUpdate: async () => ({ ok: true }),
      onUpdateAvailable: () => () => {},
      onUpdateDownloaded: () => () => {},
      onUpdateError: () => () => {},
    },
    ...overrides,
  };
}
