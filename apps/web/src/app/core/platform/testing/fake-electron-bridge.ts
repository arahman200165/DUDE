import type { PlatformBridge } from "@dude/contracts/shared/models/platform-bridge.model";
import { fakeHub } from './fake-hub';
import type { BackgroundAgentStatus, DeviceStoreDevice, KvMutation, StoreHealth } from "@dude/contracts";
import type { HistoryRetention, NetworkRunRetention } from "@dude/persistence";
import { InMemoryHistoryRepository, InMemoryNetworkRunRepository } from "@dude/persistence/testing";

/**
 * A full `PlatformBridge` stub with a sensible "nothing configured yet"
 * default for every member, for specs that need `window.dude` present.
 * Pass `overrides` for the parts the test actually cares about — this way
 * a spec file doesn't need to restate every bridge member just to satisfy
 * the type whenever a new one is added.
 */
export function fakeElectronBridge(overrides: Partial<PlatformBridge> = {}): PlatformBridge {
  return {
    platform: { isDesktop: true, wasRestoredAfterCrash: false },
    deepLink: { ready: () => {}, onItem: () => () => {} },
    external: { open: async () => ({ ok: true }) },
    store: fakeStore(),
    hub: fakeHub(),
    device: fakeDevice(),
    menu: { ready: () => {}, onAction: () => () => {}, setToolMenuData: async () => ({ ok: true }) },
    quickLauncher: { ready: () => {}, onOpen: () => () => {}, onDismissed: () => () => {}, dismiss: async () => ({ ok: true }), promote: async () => ({ ok: true }), getHotkey: async () => null, setHotkey: async () => ({ ok: true }) },
    preferences: { get: async () => ({ closeToTray: true, launchMinimized: false, startupDestination: 'workspace', preferredDisplayId: null, rememberWindowBounds: true, updateMode: 'auto-download', notifyUpdates: true, notifyCollaboration: true }), set: async () => ({ ok: true, value: { closeToTray: true, launchMinimized: false, startupDestination: 'workspace', preferredDisplayId: null, rememberWindowBounds: true, updateMode: 'auto-download', notifyUpdates: true, notifyCollaboration: true } }), displays: async () => [], setupRequest: async () => null },
    open: { ready: () => {}, pickFile: async () => ({ canceled: true }), getPathForFile: () => '', enqueuePath: async () => ({ ok: true }), reopen: async () => ({ ok: true }), onItem: () => () => {} },
    fs: {
      pickDirectory: async () => ({ canceled: true }),
      pickFile: async () => ({ canceled: true }),
      pickSavePath: async () => ({ canceled: true }),
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
      status: async (purpose) => ({ purpose, isSet: false, hint: null, needsReentry: false }),
      set: async () => ({ ok: true }),
      remove: async () => ({ ok: true }),
    },
    ai: {
      getConfig: async () => ({ baseUrl: '', model: '', apiKey: { purpose: 'ai.llmApiKey', isSet: false, hint: null, needsReentry: false } }),
      setConfig: async () => ({ ok: true }),
    },
    llm: {
      isConfigured: async () => false,
      chat: async () => ({ ok: false, error: 'not-configured' }),
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
    powershell: {
      catalog: async () => ({ version: '7.6.0', commands: [] }),
      preview: async () => { throw new Error('unavailable'); },
      discard: async () => false,
      confirm: async () => { throw new Error('unavailable'); },
      run: async () => { throw new Error('unavailable'); },
      cancel: async () => false,
      history: async () => [],
      clearHistory: async () => {},
      onEvent: () => () => {},
    },
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
    sysBundle: {
      estimate: async () => ({ ok: false as const, error: 'unavailable' }), write: async () => ({ ok: false as const, error: 'unavailable' }),
      cancel: async () => false, reveal: async () => false, onProgress: () => () => {},
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

/** In-memory device store: kv and entity commits are kept so specs can inspect what the renderer wrote. */
export function fakeStore(): PlatformBridge['store'] {
  const kv = new Map<string, unknown>();
  const records = new Map<string, unknown>();
  const flushListeners = new Set<() => void | Promise<void>>();
  const healthListeners = new Set<(health: StoreHealth) => void>();
  const health: StoreHealth = { status: 'ready', schemaVersion: 1, minReaderVersion: 1, sizeBytes: 0, outbox: { pending: 0, maxRows: 0, backpressure: false }, legacyImport: 'none' };
  let revision = 0;
  const apply = (m: KvMutation): void => {
    const key = `${m.namespace}\u001f${m.key}`;
    if (m.remove) kv.delete(key); else kv.set(key, m.value);
  };
  return {
    hydrate: async () => ({
      status: 'ready',
      device: fakeDeviceRecord,
      kv: [...kv].map(([k, value]) => { const [namespace, key] = k.split('\u001f'); return { namespace, key, value }; }),
      records: [...records].map(([k, payload]) => { const [entityType, entityId] = k.split('\u001f'); return { entityType, entityId, payload }; }),
    }),
    commitKv: async (mutations) => { mutations.forEach(apply); return { ok: true, count: mutations.length }; },
    commitKvNoWait: (mutations) => { mutations.forEach(apply); },
    commitEntity: async (commit) => {
      const key = `${commit.entityType}\u001f${commit.entityId}`;
      if (commit.op === 'delete') records.delete(key); else records.set(key, commit.payload);
      return { ok: true, localRevision: ++revision };
    },
    importEntities: async (commits) => {
      for (const c of commits) records.set(`${c.entityType}\u001f${c.entityId}`, c.payload);
      return { ok: true, count: commits.length, backpressure: false };
    },
    status: async () => health,
    retry: async () => health,
    reset: {
      preview: async (kind) => ({ ok: true, kind, token: 'fake-token', counts: { kv: kv.size, records: records.size }, expiresAt: new Date(Date.now() + 60_000).toISOString(), keepsIdentity: kind === 'clear-data', wipesSecrets: kind === 'reset-device' }),
      apply: async () => { kv.clear(); records.clear(); return { ok: true }; },
    },
    recovery: {
      openFolder: async () => ({ ok: true }),
      quarantinePreview: async () => ({ ok: false, error: 'not-needed' }),
      quarantineApply: async () => ({ ok: false, error: 'invalid-token' }),
    },
    history: fakeHistory(),
    network: fakeNetwork(),
    onFlushRequest: (callback) => { flushListeners.add(callback); return () => { flushListeners.delete(callback); }; },
    onHealth: (callback) => { healthListeners.add(callback); return () => { healthListeners.delete(callback); }; },
  };
}

const fakeDeviceRecord: DeviceStoreDevice = {
  deviceId: 'fake-device', environmentId: 'fake-environment', displayName: 'Test device', platform: 'windows', appVersion: '0.0.0', enrollmentState: 'standalone',
};

/** Fixture: this device enrolled in (or revoked by) a Hub. */
export function fakeEnrolledDeviceRecord(state: 'enrolled' | 'revoked' = 'enrolled'): DeviceStoreDevice {
  return {
    ...fakeDeviceRecord,
    enrollmentState: state,
    enrollment: { environmentId: '0190ffff-bbbb-7ccc-8ddd-eeeeeeeeeeee', hubInstanceId: 'fake-hub', hubUrl: 'https://hub.local:8443', enrolledAt: '2026-01-03T00:00:00.000Z' },
  };
}

export function fakeDevice(initial: Partial<DeviceStoreDevice> = {}): PlatformBridge['device'] {
  let record: DeviceStoreDevice = { ...fakeDeviceRecord, ...initial };
  let agent: BackgroundAgentStatus = { running: true, stoppedByUser: false, autostart: 'disabled', mechanism: null };
  return {
    get: async () => record,
    rename: async (displayName) => { record = { ...record, displayName }; return { ok: true, displayName }; },
    agentStatus: async () => ({ ...agent }),
    setAgentAutostart: async (enabled) => { agent = { ...agent, autostart: enabled ? 'enabled' : 'disabled', mechanism: enabled ? 'run-key' : null }; return { ok: true, status: { ...agent } }; },
    stopAgent: async () => { agent = { ...agent, running: false, stoppedByUser: true }; return { ok: true, status: { ...agent } }; },
    startAgent: async () => { agent = { ...agent, running: true, stoppedByUser: false }; return { ok: true, status: { ...agent } }; },
  };
}

const DAY = 24 * 60 * 60 * 1000;

/** In-memory history with the real retention caps, backed by the portable in-memory adapter. */
export function fakeHistory(retention: HistoryRetention = { maxPerTool: 200, maxTotal: 5000, maxAgeMs: 90 * DAY, maxEntryBytes: 256 * 1024 }, now: () => number = Date.now): PlatformBridge['store']['history'] {
  const repo = new InMemoryHistoryRepository(retention, now);
  return {
    add: (entry) => repo.add(entry),
    list: async (query) => (query?.toolId !== undefined ? (await repo.listByTool(query.toolId)).slice(0, query.limit) : repo.listRecent(query?.limit ?? 5000)),
    get: async (id) => (await repo.get(id)) ?? null,
    remove: async (id) => { await repo.remove(id); return { ok: true }; },
    clear: async () => { await repo.clear(); return { ok: true }; },
    clearTool: async (toolId) => { await repo.clearTool(toolId); return { ok: true }; },
  };
}

export function fakeNetwork(retention: NetworkRunRetention = { maxRuns: 100, maxAgeMs: 30 * DAY, maxTotalBytes: 50_000_000 }, now: () => number = Date.now): PlatformBridge['store']['network'] {
  const repo = new InMemoryNetworkRunRepository(retention, now);
  return {
    add: (run) => repo.add(run),
    list: async (query) => (await repo.list()).slice(0, query?.limit),
    get: async (id) => (await repo.get(id)) ?? null,
    remove: async (id) => { await repo.remove(id); return { ok: true }; },
    clear: async () => { await repo.clear(); return { ok: true }; },
  };
}
