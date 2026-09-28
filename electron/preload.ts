import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DudeElectronBridge, FileWatchEvent, DesktopOpenItem } from '../src/app/core/platform/electron-bridge';

// A static flag baked in at preload time from `additionalArguments` (`main.ts`'s `createWindow`),
// the same way `platform.isDesktop` below is a plain literal rather than an IPC round-trip.
const wasRestoredAfterCrash = process.argv.includes('--dude-was-restored-after-crash=true');

const bridge: DudeElectronBridge = {
  preferences: {
    get: () => ipcRenderer.invoke('dude:preferences:get'),
    set: (patch) => ipcRenderer.invoke('dude:preferences:set', patch),
    displays: () => ipcRenderer.invoke('dude:preferences:displays'),
    setupRequest: () => ipcRenderer.invoke('dude:preferences:setupRequest'),
  },
  open: {
    ready: () => ipcRenderer.send('dude:open:ready'),
    pickFile: () => ipcRenderer.invoke('dude:open:pickFile'),
    getPathForFile: (file) => webUtils.getPathForFile(file),
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
      const listener = (_event: Electron.IpcRendererEvent, value: import('../src/shared-logic/fs/fs-types').FsJobEvent) => callback(value);
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
      const listener = (_event: Electron.IpcRendererEvent, state: import('../src/shared-logic/fs/watch-types').FolderWatchState) => callback(state);
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
    get: (key) => ipcRenderer.invoke('dude:secrets:get', key),
    set: (key, value) => ipcRenderer.invoke('dude:secrets:set', key, value),
    remove: (key) => ipcRenderer.invoke('dude:secrets:remove', key),
  },
  llm: {
    isConfigured: () => ipcRenderer.invoke('dude:llm:isConfigured'),
    getEndpoint: () => ipcRenderer.invoke('dude:llm:getEndpoint'),
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
      const listener = (_event: Electron.IpcRendererEvent, value: import('../src/app/core/platform/network-types').NetworkJobEvent) => callback(value);
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
        const listener = (_event: Electron.IpcRendererEvent, state: import('../src/app/core/platform/network-types').WatchState) => callback(state);
        ipcRenderer.on('dude:network:watch:changed', listener);
        return () => ipcRenderer.removeListener('dude:network:watch:changed', listener);
      },
    },
  },  update: {
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
