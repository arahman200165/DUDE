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
    platform: { isDesktop: true, wasRestoredAfterCrash: false },
    deepLink: { ready: () => {}, onItem: () => () => {} },
    external: { open: async () => ({ ok: true }) },
    menu: { ready: () => {}, onAction: () => () => {}, setToolMenuData: async () => ({ ok: true }) },
    quickLauncher: { ready: () => {}, onOpen: () => () => {}, onDismissed: () => () => {}, dismiss: async () => ({ ok: true }), promote: async () => ({ ok: true }), getHotkey: async () => null, setHotkey: async () => ({ ok: true }) },
    preferences: { get: async () => ({ closeToTray: true, launchMinimized: false, startupDestination: 'workspace', preferredDisplayId: null, rememberWindowBounds: true, updateMode: 'auto-download', notifyUpdates: true, notifyCollaboration: true }), set: async () => ({ ok: true, value: { closeToTray: true, launchMinimized: false, startupDestination: 'workspace', preferredDisplayId: null, rememberWindowBounds: true, updateMode: 'auto-download', notifyUpdates: true, notifyCollaboration: true } }), displays: async () => [], setupRequest: async () => null },
    open: { ready: () => {}, pickFile: async () => ({ canceled: true }), getPathForFile: () => '', enqueuePath: async () => ({ ok: true }), reopen: async () => ({ ok: true }), onItem: () => () => {} },
    fs: {
      pickDirectory: async () => ({ canceled: true }),
      pickFile: async () => ({ canceled: true }),
      readRange: async () => ({ ok: true, data: new ArrayBuffer(0), size: 0 }),
      listRemembered: async () => [],
      remember: async () => ({ ok: true, folders: [] }),
      forget: async () => ({ ok: true, folders: [] }),
      isGranted: async () => false,
      walk: async () => ({ ok: true, entries: [] }),
      readFile: async () => ({ ok: true, data: new ArrayBuffer(0) }),
      readdir: async () => ({ ok: true, names: [] }),
      stat: async () => ({ ok: true, stat: { isFile: false, isDirectory: true, isSymbolicLink: false, size: 0, mtimeMs: 0 } }),
    },
    fsJobs: {
      start: async () => ({ ok: true, jobId: 'job-1' }),
      cancel: async () => true,
      onEvent: () => () => {},
    },
    fsWatch: {
      get: async () => ({ ok: true, value: { settings: { enabled: false, notifyEveryMinutes: 5 }, folders: [] } }),
      add: async () => ({ ok: false, error: 'not-configured' }),
      update: async () => ({ ok: false, error: 'not-configured' }),
      remove: async () => ({ ok: false, error: 'not-configured' }),
      setSettings: async () => ({ ok: true, value: { settings: { enabled: false, notifyEveryMinutes: 5 }, folders: [] } }),
      timeline: async () => ({ ok: true, value: [] }),
      clearTimeline: async () => ({ ok: true, value: { settings: { enabled: false, notifyEveryMinutes: 5 }, folders: [] } }),
      clearContent: async () => ({ ok: true, value: { settings: { enabled: false, notifyEveryMinutes: 5 }, folders: [] } }),
      content: async () => ({ ok: false, error: 'not-found' }),
      onChanged: () => () => {},
    },
    fsSnapshots: {
      list: async () => ({ ok: true, value: [] }),
      export: async () => ({ ok: false, error: 'not-found' }),
      import: async () => ({ ok: false, error: 'not-configured' }),
      delete: async () => ({ ok: true, value: undefined }),
      compare: async () => ({ ok: false, error: 'not-found' }),
    },
    fsMutation: {
      planTrash: async () => ({ ok: false, error: 'not-configured' }),
      planWriteText: async () => ({ ok: false, error: 'not-configured' }),
      planUndo: async () => ({ ok: false, error: 'not-configured' }),
      issueToken: async () => ({ ok: false, error: 'not-configured' }),
      apply: async () => ({ ok: false, error: 'not-configured' }),
      cancelApply: async () => false,
      discard: async () => true,
      journal: async () => ({ ok: true, value: [] }),
      getSettings: async () => ({ ok: true, value: { settings: { retentionDays: 30, maxBackupBytes: 5 * 1024 ** 3 }, backupBytes: 0 } }),
      setSettings: async () => ({ ok: true, value: { retentionDays: 30, maxBackupBytes: 5 * 1024 ** 3 } }),
      purgeBackups: async () => ({ ok: true, value: undefined }),
      onProgress: () => () => {},
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
    network: { prepare: async () => ({ ok: false, error: 'unavailable' }), start: async () => ({ ok: false, error: 'unavailable' }), cancel: async () => false, adminStatus: async () => false, relaunchAsAdmin: async () => false, onEvent: () => () => {}, watch: { get: async () => ({ ok: true, state: { settings: { enabled: false, intervalHours: 24, thresholds: [30, 14, 7, 1], failureAlertAfter: 3, notifications: true }, entries: [] } }), upsert: async () => ({ ok: false, error: 'unavailable' }), remove: async () => ({ ok: true }), clearPrepare: async () => ({ ok: true, token: 't', count: 0 }), clearConfirm: async () => ({ ok: true }), setSettings: async () => ({ ok: false, error: 'unavailable' }), checkNow: async () => ({ ok: false, error: 'unavailable' }), export: async () => ({ ok: true, json: '{}' }), import: async () => ({ ok: false, error: 'unavailable' }), onChanged: () => () => {} } },
    dependencyWalker: { walk: async () => { throw new Error('unavailable'); } },
    sys: {
      call: async () => ({ ok: false, error: 'unavailable' }),
      pwshStatus: async () => ({ available: false, reason: 'unavailable' }),
      taskList: async () => [],
      taskInfo: async (taskPath: string, taskName: string) => ({ taskPath, taskName, state: 'Unknown', enabled: false, lastRunTime: null, nextRunTime: null, lastTaskResult: null, triggers: [], actions: [], principal: { userId: null, groupId: null, logonType: null, runLevel: null } }),
      startupList: async () => ({ entries: [], warnings: [] }),
      listInstalledSoftware: async () => [],
      featureList: async () => [],
      featureCapabilities: async () => [],
      onEvent: () => () => {},
    },
    sysMutation: {
      plan: async () => ({ ok: false as const, error: 'unavailable' }), planUndo: async () => ({ ok: false as const, error: 'unavailable' }), issueToken: async () => ({ ok: false as const, error: 'unavailable' }), apply: async () => ({ ok: false as const, error: 'unavailable' }),
      cancelApply: async () => false, discard: async () => false,
      journal: async () => ({ ok: true as const, value: [] }),
      getSettings: async () => ({ ok: true as const, value: { settings: { retentionDays: 30, maxBackupBytes: 500 * 1024 ** 2 }, backupBytes: 0 } }),
      setSettings: async () => ({ ok: false as const, error: 'unavailable' }), purgeBackups: async () => ({ ok: false as const, error: 'unavailable' }),
      onProgress: () => () => {},
    },
    sysSnapshots: {
      list: async () => ({ ok: true as const, value: [] }),
      get: async () => ({ ok: false as const, error: 'unavailable' }), save: async () => ({ ok: false as const, error: 'unavailable' }), remove: async () => ({ ok: false as const, error: 'unavailable' }), exportJson: async () => ({ ok: false as const, error: 'unavailable' }), importJson: async () => ({ ok: false as const, error: 'unavailable' }),
      usage: async () => ({ ok: true as const, value: { count: 0, bytes: 0 } }),
    },
    runtime: {
      probe: async () => [],
    },
    elevation: {
      status: async () => false,
      relaunch: async () => false,
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
