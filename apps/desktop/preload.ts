import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { PlatformBridge, FileWatchEvent, DesktopOpenItem } from "@dude/contracts/shared/models/platform-bridge.model";

// A static flag baked in at preload time from `additionalArguments` (`main.ts`'s `createWindow`),
// the same way `platform.isDesktop` below is a plain literal rather than an IPC round-trip.
const wasRestoredAfterCrash = process.argv.includes('--dude-was-restored-after-crash=true');

const bridge: PlatformBridge = {
  preferences: {
    get: () => ipcRenderer.invoke('dude:preferences:get'),
    set: (patch) => ipcRenderer.invoke('dude:preferences:set', patch),
    displays: () => ipcRenderer.invoke('dude:preferences:displays'),
    setupRequest: () => ipcRenderer.invoke('dude:preferences:setupRequest'),
  },
  open: {
    ready: () => ipcRenderer.send('dude:open:ready'),
    pickFile: () => ipcRenderer.invoke('dude:open:pickFile'),
    getPathForFile: (file) => webUtils.getPathForFile(file as File),
    enqueuePath: (path) => ipcRenderer.invoke('dude:open:enqueuePath', path),
    reopen: (path) => ipcRenderer.invoke('dude:open:reopen', path),
    onItem: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, item: DesktopOpenItem) => callback(item);
      ipcRenderer.on('dude:open:item', listener);
      return () => ipcRenderer.removeListener('dude:open:item', listener);
    },
  },
  deepLink: {
    ready: () => ipcRenderer.send('dude:deepLink:ready'),
    onItem: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
      ipcRenderer.on('dude:deepLink:item', listener);
      return () => ipcRenderer.removeListener('dude:deepLink:item', listener);
    },
  },
  external: {
    open: (url) => ipcRenderer.invoke('dude:external:open', url),
  },
  store: {
    hydrate: () => ipcRenderer.invoke('dude:store:hydrate'),
    commitKv: (mutations) => ipcRenderer.invoke('dude:store:kv:commit', mutations),
    commitKvNoWait: (mutations) => ipcRenderer.send('dude:store:kv:commitNoWait', mutations),
    commitEntity: (commit) => ipcRenderer.invoke('dude:store:entity:commit', commit),
    importEntities: (commits) => ipcRenderer.invoke('dude:store:entity:importMany', commits),
    status: () => ipcRenderer.invoke('dude:store:status'),
    retry: () => ipcRenderer.invoke('dude:store:retry'),
    reset: {
      preview: (kind) => ipcRenderer.invoke('dude:store:reset:preview', kind),
      apply: (request) => ipcRenderer.invoke('dude:store:reset:apply', request),
    },
    recovery: {
      // No argument is forwarded: main alone chooses the folder.
      openFolder: () => ipcRenderer.invoke('dude:store:recovery:openFolder'),
      quarantinePreview: () => ipcRenderer.invoke('dude:store:recovery:quarantinePreview'),
      quarantineApply: (token) => ipcRenderer.invoke('dude:store:recovery:quarantineApply', token),
    },
    history: {
      add: (entry) => ipcRenderer.invoke('dude:store:history:add', entry),
      list: (query) => ipcRenderer.invoke('dude:store:history:list', query),
      get: (id) => ipcRenderer.invoke('dude:store:history:get', id),
      remove: (id) => ipcRenderer.invoke('dude:store:history:remove', id),
      clear: () => ipcRenderer.invoke('dude:store:history:clear'),
      clearTool: (toolId) => ipcRenderer.invoke('dude:store:history:clearTool', toolId),
    },
    network: {
      add: (run) => ipcRenderer.invoke('dude:store:network:add', run),
      list: (query) => ipcRenderer.invoke('dude:store:network:list', query),
      get: (id) => ipcRenderer.invoke('dude:store:network:get', id),
      remove: (id) => ipcRenderer.invoke('dude:store:network:remove', id),
      clear: () => ipcRenderer.invoke('dude:store:network:clear'),
    },
    onFlushRequest: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, id: number) => {
        void Promise.resolve().then(callback).catch(() => undefined).finally(() => ipcRenderer.send('dude:store:flushed', id));
      };
      ipcRenderer.on('dude:store:flush', listener);
      return () => ipcRenderer.removeListener('dude:store:flush', listener);
    },
    onHealth: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, health: Parameters<typeof callback>[0]) => callback(health);
      ipcRenderer.on('dude:store:health', listener);
      return () => ipcRenderer.removeListener('dude:store:health', listener);
    },
  },
  device: {
    get: () => ipcRenderer.invoke('dude:device:get'),
    rename: (displayName) => ipcRenderer.invoke('dude:device:rename', displayName),
    agentStatus: () => ipcRenderer.invoke('dude:device:agentStatus'),
    setAgentAutostart: (enabled) => ipcRenderer.invoke('dude:device:setAgentAutostart', enabled),
    stopAgent: () => ipcRenderer.invoke('dude:device:stopAgent'),
    startAgent: () => ipcRenderer.invoke('dude:device:startAgent'),
  },
  hub: {
    status: () => ipcRenderer.invoke('dude:hub:status'),
    probeLocal: (a) => ipcRenderer.invoke('dude:hub:probeLocal', a),
    enroll: (a) => ipcRenderer.invoke('dude:hub:enroll', a),
    unenroll: (a) => ipcRenderer.invoke('dude:hub:unenroll', a),
    ownerStatus: () => ipcRenderer.invoke('dude:hub:owner:status'),
    ownerSignIn: (a) => ipcRenderer.invoke('dude:hub:owner:signIn', a),
    ownerSignOut: () => ipcRenderer.invoke('dude:hub:owner:signOut'),
    listDevices: () => ipcRenderer.invoke('dude:hub:owner:listDevices'),
    createPairingCode: (a) => ipcRenderer.invoke('dude:hub:owner:createPairingCode', a),
    renameDevice: (a, b) => ipcRenderer.invoke('dude:hub:owner:renameDevice', a, b),
    revokeDevicePreview: (a) => ipcRenderer.invoke('dude:hub:owner:revokeDevicePreview', a),
    revokeDevice: (a, b) => ipcRenderer.invoke('dude:hub:owner:revokeDevice', a, b),
    setRecoveryTrust: (a, b, c) => ipcRenderer.invoke('dude:hub:owner:setRecoveryTrust', a, b, c),
    listSessions: () => ipcRenderer.invoke('dude:hub:owner:listSessions'),
    revokeSession: (a) => ipcRenderer.invoke('dude:hub:owner:revokeSession', a),
    revokeAllPreview: () => ipcRenderer.invoke('dude:hub:owner:revokeAllPreview'),
    revokeAll: (a) => ipcRenderer.invoke('dude:hub:owner:revokeAll', a),
    listAudit: (a) => ipcRenderer.invoke('dude:hub:owner:listAudit', a),
    recoveryCodesPreview: () => ipcRenderer.invoke('dude:hub:owner:recoveryCodesPreview'),
    regenerateRecoveryCodes: (a) => ipcRenderer.invoke('dude:hub:owner:regenerateRecoveryCodes', a),
    changePassword: (a, b) => ipcRenderer.invoke('dude:hub:owner:changePassword', a, b),
    recoverOwner: (a) => ipcRenderer.invoke('dude:hub:recoverOwner', a),
    onStatusChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]) => callback(status);
      ipcRenderer.on('dude:hub:statusChanged', listener);
      return () => ipcRenderer.removeListener('dude:hub:statusChanged', listener);
    },
  },
  appearance: {
    setNative: (mode, background) => ipcRenderer.invoke('dude:appearance:set', { mode, background }),
  },
  menu: {
    ready: () => ipcRenderer.send('dude:menu:ready'),
    setToolMenuData: (tools) => ipcRenderer.invoke('dude:menu:setToolMenuData', tools),
    onAction: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
      ipcRenderer.on('dude:menu:action', listener);
      return () => ipcRenderer.removeListener('dude:menu:action', listener);
    },
  },
  quickLauncher: {
    ready: () => ipcRenderer.send('dude:quickLauncher:ready'),
    onOpen: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: { compact: boolean }) => callback(value);
      ipcRenderer.on('dude:quickLauncher:open', listener);
      return () => ipcRenderer.removeListener('dude:quickLauncher:open', listener);
    },
    onDismissed: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('dude:quickLauncher:dismissed', listener);
      return () => ipcRenderer.removeListener('dude:quickLauncher:dismissed', listener);
    },
    dismiss: () => ipcRenderer.invoke('dude:quickLauncher:dismiss'),
    promote: () => ipcRenderer.invoke('dude:quickLauncher:promote'),
    getHotkey: () => ipcRenderer.invoke('dude:quickLauncher:getHotkey'),
    setHotkey: (accelerator) => ipcRenderer.invoke('dude:quickLauncher:setHotkey', accelerator),
  },
  platform: { isDesktop: true, wasRestoredAfterCrash },
  fs: {
    pickDirectory: (defaultPath) => ipcRenderer.invoke('dude:fs:pickDirectory', defaultPath),
    pickFile: (defaultPath) => ipcRenderer.invoke('dude:fs:pickFile', defaultPath),
    pickSavePath: (request) => ipcRenderer.invoke('dude:fs:pickSavePath', request),
    readRange: (rootPath, relativePath, offset, length) => ipcRenderer.invoke('dude:fs:readRange', rootPath, relativePath, offset, length),
    listRemembered: () => ipcRenderer.invoke('dude:fs:listRemembered'),
    remember: (rootPath) => ipcRenderer.invoke('dude:fs:remember', rootPath),
    forget: (rootPath) => ipcRenderer.invoke('dude:fs:forget', rootPath),
    isGranted: (rootPath) => ipcRenderer.invoke('dude:fs:isGranted', rootPath),
    walk: (rootPath) => ipcRenderer.invoke('dude:fs:walk', rootPath),
    readFile: (rootPath, relativePath) => ipcRenderer.invoke('dude:fs:readFile', rootPath, relativePath),
    readdir: (rootPath, relativePath) => ipcRenderer.invoke('dude:fs:readdir', rootPath, relativePath),
    stat: (rootPath, relativePath, followSymlink) => ipcRenderer.invoke('dude:fs:stat', rootPath, relativePath, followSymlink),
  },
  fsJobs: {
    start: (request) => ipcRenderer.invoke('dude:fsjob:start', request),
    cancel: (jobId) => ipcRenderer.invoke('dude:fsjob:cancel', jobId),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: import("@dude/contracts/fs/fs-types").FsJobEvent) => callback(value);
      ipcRenderer.on('dude:fsjob:event', listener);
      return () => ipcRenderer.removeListener('dude:fsjob:event', listener);
    },
  },
  fsWatch: {
    get: () => ipcRenderer.invoke('dude:fswatch:get'),
    add: (path, folder) => ipcRenderer.invoke('dude:fswatch:add', path, folder),
    update: (id, patch) => ipcRenderer.invoke('dude:fswatch:update', id, patch),
    remove: (id) => ipcRenderer.invoke('dude:fswatch:remove', id),
    setSettings: (patch) => ipcRenderer.invoke('dude:fswatch:setSettings', patch),
    timeline: (query) => ipcRenderer.invoke('dude:fswatch:timeline', query),
    clearTimeline: (id) => ipcRenderer.invoke('dude:fswatch:clearTimeline', id),
    clearContent: (id) => ipcRenderer.invoke('dude:fswatch:clearContent', id),
    content: (id, hash) => ipcRenderer.invoke('dude:fswatch:content', id, hash),
    onChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, state: import("@dude/contracts/fs/watch-types").FolderWatchState) => callback(state);
      ipcRenderer.on('dude:fswatch:changed', listener);
      return () => ipcRenderer.removeListener('dude:fswatch:changed', listener);
    },
  },
  fsSnapshots: {
    list: () => ipcRenderer.invoke('dude:fssnap:list'),
    export: (id) => ipcRenderer.invoke('dude:fssnap:export', id),
    import: (json) => ipcRenderer.invoke('dude:fssnap:import', json),
    delete: (id) => ipcRenderer.invoke('dude:fssnap:delete', id),
    compare: (baseId, compareId) => ipcRenderer.invoke('dude:fssnap:compare', baseId, compareId),
  },
  fsMutation: {
    planTrash: (root, paths, tool, title) => ipcRenderer.invoke('dude:fsmut:planTrash', root, paths, tool, title),
    planWriteText: (root, relativePath, text, tool) => ipcRenderer.invoke('dude:fsmut:planWriteText', root, relativePath, text, tool),
    planUndo: (planId) => ipcRenderer.invoke('dude:fsmut:planUndo', planId),
    issueToken: (planId) => ipcRenderer.invoke('dude:fsmut:issueToken', planId),
    apply: (planId, token, options) => ipcRenderer.invoke('dude:fsmut:apply', planId, token, options),
    cancelApply: (planId) => ipcRenderer.invoke('dude:fsmut:cancelApply', planId),
    discard: (planId) => ipcRenderer.invoke('dude:fsmut:discard', planId),
    journal: () => ipcRenderer.invoke('dude:fsmut:journal'),
    getSettings: () => ipcRenderer.invoke('dude:fsmut:getSettings'),
    setSettings: (patch) => ipcRenderer.invoke('dude:fsmut:setSettings', patch),
    purgeBackups: (planId) => ipcRenderer.invoke('dude:fsmut:purgeBackups', planId),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: { planId: string; done: number; total: number }) => callback(value);
      ipcRenderer.on('dude:fsmut:progress', listener);
      return () => ipcRenderer.removeListener('dude:fsmut:progress', listener);
    },
  },
  secrets: {
    status: (purpose) => ipcRenderer.invoke('dude:secrets:status', purpose),
    set: (purpose, value) => ipcRenderer.invoke('dude:secrets:set', purpose, value),
    remove: (purpose) => ipcRenderer.invoke('dude:secrets:remove', purpose),
  },
  ai: {
    getConfig: () => ipcRenderer.invoke('dude:ai:getConfig'),
    setConfig: (config) => ipcRenderer.invoke('dude:ai:setConfig', config),
  },
  llm: {
    isConfigured: () => ipcRenderer.invoke('dude:llm:isConfigured'),
    chat: (request) => ipcRenderer.invoke('dude:llm:chat', request),
  },
  shell: {
    getLaunchOnLogin: () => ipcRenderer.invoke('dude:shell:getLaunchOnLogin'),
    setLaunchOnLogin: (enabled) => ipcRenderer.invoke('dude:shell:setLaunchOnLogin', enabled),
    openDefaultApps: () => ipcRenderer.invoke('dude:shell:openDefaultApps'),
    getFileAssociations: () => ipcRenderer.invoke('dude:shell:getFileAssociations'),
  },
  quickActions: {
    list: () => ipcRenderer.invoke('dude:quickActions:list'),
    run: (actionId) => ipcRenderer.invoke('dude:quickActions:run', actionId),
    setHotkey: (actionId, accelerator) => ipcRenderer.invoke('dude:quickActions:setHotkey', actionId, accelerator),
  },
  smartPaste: {
    ready: () => ipcRenderer.send('dude:smartPaste:ready'),
    onTrigger: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
      ipcRenderer.on('dude:smartPaste:trigger', listener);
      return () => ipcRenderer.removeListener('dude:smartPaste:trigger', listener);
    },
    getHotkey: () => ipcRenderer.invoke('dude:smartPaste:getHotkey'),
    setHotkey: (accelerator) => ipcRenderer.invoke('dude:smartPaste:setHotkey', accelerator),
  },
  notifications: {
    show: (title, body) => ipcRenderer.invoke('dude:notifications:show', title, body),
  },
  fileWatch: {
    watch: (rootPath, relativePath, recursive) => ipcRenderer.invoke('dude:fileWatch:watch', rootPath, relativePath, recursive),
    unwatch: (watchId) => ipcRenderer.invoke('dude:fileWatch:unwatch', watchId),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, message: FileWatchEvent) => callback(message);
      ipcRenderer.on('dude:fileWatch:event', listener);
      return () => ipcRenderer.removeListener('dude:fileWatch:event', listener);
    },
  },
  collab: {
    startSession: () => ipcRenderer.invoke('dude:collab:startSession'),
    stopSession: () => ipcRenderer.invoke('dude:collab:stopSession'),
    participantCount: () => ipcRenderer.invoke('dude:collab:participantCount'),
  },
  network: {
    prepare: (request) => ipcRenderer.invoke('dude:network:prepare', request),
    start: (request, token) => ipcRenderer.invoke('dude:network:start', request, token),
    cancel: (jobId) => ipcRenderer.invoke('dude:network:cancel', jobId),
    adminStatus: () => ipcRenderer.invoke('dude:network:adminStatus'),
    relaunchAsAdmin: () => ipcRenderer.invoke('dude:network:relaunchAsAdmin'),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: import("@dude/contracts/core/platform/network-types").NetworkJobEvent) => callback(value);
      ipcRenderer.on('dude:network:event', listener);
      return () => ipcRenderer.removeListener('dude:network:event', listener);
    },
    watch: {
      get: () => ipcRenderer.invoke('dude:network:watch:get'),
      upsert: (entry) => ipcRenderer.invoke('dude:network:watch:upsert', entry),
      remove: (id) => ipcRenderer.invoke('dude:network:watch:remove', id),
      clearPrepare: () => ipcRenderer.invoke('dude:network:watch:clearPrepare'),
      clearConfirm: (token) => ipcRenderer.invoke('dude:network:watch:clearConfirm', token),
      setSettings: (settings) => ipcRenderer.invoke('dude:network:watch:setSettings', settings),
      checkNow: (id) => ipcRenderer.invoke('dude:network:watch:checkNow', id),
      export: () => ipcRenderer.invoke('dude:network:watch:export'),
      import: (json) => ipcRenderer.invoke('dude:network:watch:import', json),
      onChanged: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, state: import("@dude/contracts/core/platform/network-types").WatchState) => callback(state);
        ipcRenderer.on('dude:network:watch:changed', listener);
        return () => ipcRenderer.removeListener('dude:network:watch:changed', listener);
      },
    },
  },
  powershell: {
    catalog: (refresh) => ipcRenderer.invoke('dude:powershell:catalog', refresh),
    preview: (script, cwd) => ipcRenderer.invoke('dude:powershell:preview', script, cwd),
    discard: (previewId) => ipcRenderer.invoke('dude:powershell:discard', previewId),
    confirm: (previewId) => ipcRenderer.invoke('dude:powershell:confirm', previewId),
    run: (previewId, token, timeoutMs) => ipcRenderer.invoke('dude:powershell:run', previewId, token, timeoutMs),
    cancel: (runId) => ipcRenderer.invoke('dude:powershell:cancel', runId),
    history: () => ipcRenderer.invoke('dude:powershell:history'),
    clearHistory: () => ipcRenderer.invoke('dude:powershell:clearHistory'),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: import("@dude/contracts/system/powershell-types").PowerShellRunEvent) => callback(value);
      ipcRenderer.on('dude:powershell:event', listener);
      return () => ipcRenderer.removeListener('dude:powershell:event', listener);
    },
  },
  dependencyWalker: { walk: (path) => ipcRenderer.invoke('dude:dependency:walk', path) },
  sys: {
    call: (method, params) => ipcRenderer.invoke('dude:sys:call', method, params),
    pwshStatus: (refresh) => ipcRenderer.invoke('dude:sys:pwshStatus', refresh),
    taskList: () => ipcRenderer.invoke('dude:sys:taskList'),
    taskInfo: (taskPath, taskName) => ipcRenderer.invoke('dude:sys:taskInfo', taskPath, taskName),
    startupList: () => ipcRenderer.invoke('dude:sys:startupList'),
    listInstalledSoftware: () => ipcRenderer.invoke('dude:sys:softwareList'),
    featureList: () => ipcRenderer.invoke('dude:sys:featureList'),
    featureCapabilities: () => ipcRenderer.invoke('dude:sys:featureCapabilities'),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: import("@dude/contracts/system/system-types").SysStreamEvent) => callback(value);
      ipcRenderer.on('dude:sys:event', listener);
      return () => ipcRenderer.removeListener('dude:sys:event', listener);
    },
  },
  sysMutation: {
    plan: (request) => ipcRenderer.invoke('dude:sysmut:plan', request),
    planUndo: (planId) => ipcRenderer.invoke('dude:sysmut:planUndo', planId),
    issueToken: (planId, typed) => ipcRenderer.invoke('dude:sysmut:issueToken', planId, typed),
    apply: (planId, token, options) => ipcRenderer.invoke('dude:sysmut:apply', planId, token, options),
    cancelApply: (planId) => ipcRenderer.invoke('dude:sysmut:cancelApply', planId),
    discard: (planId) => ipcRenderer.invoke('dude:sysmut:discard', planId),
    journal: () => ipcRenderer.invoke('dude:sysmut:journal'),
    getSettings: () => ipcRenderer.invoke('dude:sysmut:getSettings'),
    setSettings: (patch) => ipcRenderer.invoke('dude:sysmut:setSettings', patch),
    purgeBackups: (planId) => ipcRenderer.invoke('dude:sysmut:purgeBackups', planId),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: { planId: string; done: number; total: number }) => callback(value);
      ipcRenderer.on('dude:sysmut:progress', listener);
      return () => ipcRenderer.removeListener('dude:sysmut:progress', listener);
    },
  },
  sysBundle: {
    estimate: (request) => ipcRenderer.invoke('dude:sys-bundle:estimate', request),
    write: (request) => ipcRenderer.invoke('dude:sys-bundle:write', request),
    cancel: (exportId) => ipcRenderer.invoke('dude:sys-bundle:cancel', exportId),
    reveal: (path) => ipcRenderer.invoke('dude:sys-bundle:reveal', path),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: import("@dude/contracts/system/bundle-types").BundleProgress) => callback(value);
      ipcRenderer.on('dude:sys-bundle:progress', listener);
      return () => ipcRenderer.removeListener('dude:sys-bundle:progress', listener);
    },
  },
  sysSnapshots: {
    list: (kind) => ipcRenderer.invoke('dude:syssnap:list', kind),
    get: (kind, id) => ipcRenderer.invoke('dude:syssnap:get', kind, id),
    save: (kind, name, source, data) => ipcRenderer.invoke('dude:syssnap:save', kind, name, source, data),
    remove: (kind, id) => ipcRenderer.invoke('dude:syssnap:remove', kind, id),
    exportJson: (kind, id) => ipcRenderer.invoke('dude:syssnap:export', kind, id),
    importJson: (json) => ipcRenderer.invoke('dude:syssnap:import', json),
    usage: () => ipcRenderer.invoke('dude:syssnap:usage'),
  },
  runtime: {
    probe: (commands) => ipcRenderer.invoke('dude:runtime:probe', commands),
  },
  elevation: {
    status: () => ipcRenderer.invoke('dude:elevation:status'),
    relaunch: () => ipcRenderer.invoke('dude:elevation:relaunch'),
  },
  update: {
    checkForUpdates: () => ipcRenderer.invoke('dude:update:check'),
    quitAndInstall: () => ipcRenderer.invoke('dude:update:quitAndInstall'),
    downloadUpdate: () => ipcRenderer.invoke('dude:update:download'),
    onUpdateAvailable: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
      ipcRenderer.on('dude:update:available', listener);
      return () => ipcRenderer.removeListener('dude:update:available', listener);
    },
    onUpdateDownloaded: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
      ipcRenderer.on('dude:update:downloaded', listener);
      return () => ipcRenderer.removeListener('dude:update:downloaded', listener);
    },
    onUpdateError: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
      ipcRenderer.on('dude:update:error', listener);
      return () => ipcRenderer.removeListener('dude:update:error', listener);
    },
  },
};

contextBridge.exposeInMainWorld('dude', bridge);
