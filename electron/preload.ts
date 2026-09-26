import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DudeElectronBridge, FileWatchEvent, DesktopOpenItem } from '../src/app/core/platform/electron-bridge';

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
  platform: { isDesktop: true },
  fs: {
    pickDirectory: () => ipcRenderer.invoke('dude:fs:pickDirectory'),
    walk: (rootPath) => ipcRenderer.invoke('dude:fs:walk', rootPath),
    readFile: (rootPath, relativePath) => ipcRenderer.invoke('dude:fs:readFile', rootPath, relativePath),
    readdir: (rootPath, relativePath) => ipcRenderer.invoke('dude:fs:readdir', rootPath, relativePath),
    stat: (rootPath, relativePath, followSymlink) => ipcRenderer.invoke('dude:fs:stat', rootPath, relativePath, followSymlink),
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
    watch: (rootPath, relativePath) => ipcRenderer.invoke('dude:fileWatch:watch', rootPath, relativePath),
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
