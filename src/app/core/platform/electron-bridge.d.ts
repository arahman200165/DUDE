import type { NetworkRequest, NetworkJobEvent, NetworkStartResult, NetworkPrepareResult } from './network-types';
export interface NativeStat {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymbolicLink: boolean;
  readonly size: number;
  readonly mtimeMs: number;
}

export type NativeFsResult<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export interface DesktopPreferences {
  closeToTray: boolean;
  launchMinimized: boolean;
  startupDestination: 'deck' | 'workspace';
  preferredDisplayId: number | null;
  rememberWindowBounds: boolean;
  updateMode: 'auto-download' | 'notify' | 'manual';
  notifyUpdates: boolean;
  notifyCollaboration: boolean;
}

export type DesktopOpenItem =
  | { readonly kind: 'file'; readonly path: string; readonly name: string; readonly extension: string; readonly text: string }
  | { readonly kind: 'directory'; readonly path: string; readonly name: string }
  | { readonly kind: 'error'; readonly path: string; readonly message: string };

export interface DudeElectronBridge {
  readonly preferences: {
    get(): Promise<DesktopPreferences>;
    set(patch: Partial<DesktopPreferences>): Promise<{ readonly ok: true; readonly value: DesktopPreferences } | { readonly ok: false; readonly error: string }>;
    displays(): Promise<readonly { readonly id: number; readonly label: string; readonly primary: boolean }[]>;
    setupRequest(): Promise<string | null>;
  };
  readonly open: {
    ready(): void;
    pickFile(): Promise<{ readonly canceled: boolean }>;
    getPathForFile(file: File): string;
    enqueuePath(path: string): Promise<VoidResult>;
    reopen(path: string): Promise<VoidResult>;
    onItem(callback: (item: DesktopOpenItem) => void): () => void;
  };
  readonly deepLink: {
    ready(): void;
    onItem(callback: (url: string) => void): () => void;
  };
  readonly menu: {
    ready(): void;
    onAction(callback: (action: string) => void): () => void;
    setToolMenuData(tools: readonly NativeMenuToolInfo[]): Promise<VoidResult>;
  };
  readonly quickLauncher: {
    ready(): void;
    onOpen(callback: (event: { readonly compact: boolean }) => void): () => void;
    onDismissed(callback: () => void): () => void;
    dismiss(): Promise<VoidResult>;
    promote(): Promise<VoidResult>;
    getHotkey(): Promise<string | null>;
    setHotkey(accelerator: string | null): Promise<VoidResult>;
  };
  readonly platform: {
    readonly isDesktop: true;
    readonly wasRestoredAfterCrash: boolean;
  };
  readonly fs: {
    pickDirectory(): Promise<{ readonly canceled: true } | { readonly canceled: false; readonly rootPath: string; readonly rootName: string }>;
    walk(rootPath: string): Promise<NativeFsResult<{ entries: readonly { readonly path: string; readonly size: number }[] }>>;
    readFile(rootPath: string, relativePath: string): Promise<NativeFsResult<{ data: ArrayBuffer }>>;
    readdir(rootPath: string, relativePath: string): Promise<NativeFsResult<{ names: readonly string[] }>>;
    stat(rootPath: string, relativePath: string, followSymlink: boolean): Promise<NativeFsResult<{ stat: NativeStat }>>;
  };
  readonly secrets: {
    get(key: string): Promise<SecretResult<{ value: string | null }>>;
    set(key: string, value: string): Promise<SecretVoidResult>;
    remove(key: string): Promise<SecretVoidResult>;
  };
  readonly llm: {
    isConfigured(): Promise<boolean>;
    getEndpoint(): Promise<{ readonly ok: true; readonly port: number } | { readonly ok: false; readonly error: string }>;
  };
  readonly shell: {
    getLaunchOnLogin(): Promise<boolean>;
    setLaunchOnLogin(enabled: boolean): Promise<{ readonly ok: true }>;
    openDefaultApps(): Promise<VoidResult>;
    getFileAssociations(): Promise<FileAssociations | null>;
  };
  readonly quickActions: {
    list(): Promise<readonly QuickActionInfo[]>;
    run(actionId: string): Promise<VoidResult>;
    setHotkey(actionId: string, accelerator: string | null): Promise<VoidResult>;
  };
  readonly smartPaste: {
    ready(): void;
    onTrigger(callback: (text: string) => void): () => void;
    getHotkey(): Promise<string | null>;
    setHotkey(accelerator: string | null): Promise<VoidResult>;
  };
  readonly notifications: {
    show(title: string, body: string): Promise<VoidResult>;
  };
  readonly fileWatch: {
    watch(rootPath: string, relativePath: string): Promise<{ readonly ok: true; readonly watchId: string } | { readonly ok: false; readonly error: string }>;
    unwatch(watchId: string): Promise<{ readonly ok: true }>;
    onEvent(callback: (event: FileWatchEvent) => void): () => void;
  };
  readonly collab: {
    startSession(): Promise<{ readonly ok: true; readonly url: string; readonly sessionCode: string } | { readonly ok: false; readonly error: string }>;
    stopSession(): Promise<{ readonly ok: true }>;
    participantCount(): Promise<number>;
  };
  readonly network: {
    prepare(request: NetworkRequest): Promise<NetworkPrepareResult>;
    start(request: NetworkRequest, token?: string): Promise<NetworkStartResult>;
    cancel(jobId: string): Promise<boolean>;
    adminStatus(): Promise<boolean>;
    relaunchAsAdmin(): Promise<boolean>;
    onEvent(callback: (event: NetworkJobEvent) => void): () => void;
  };  readonly update: {
    checkForUpdates(): Promise<VoidResult>;
    quitAndInstall(): Promise<VoidResult>;
    downloadUpdate(): Promise<VoidResult>;
    onUpdateAvailable(callback: (info: { readonly version: string }) => void): () => void;
    onUpdateDownloaded(callback: (info: { readonly version: string }) => void): () => void;
    onUpdateError(callback: (message: string) => void): () => void;
  };
}

export interface NativeMenuToolInfo {
  readonly id: string;
  readonly title: string;
  readonly route: string;
  readonly category: string;
}

export interface FileAssociations {
  readonly candidateExtensions: readonly string[];
}

export interface QuickActionInfo {
  readonly id: string;
  readonly label: string;
  readonly hotkey: string | null;
}

export type FileWatchEvent = { readonly id: string; readonly kind: 'changed' } | { readonly id: string; readonly kind: 'error'; readonly error: string };

export type SecretResult<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: string };
export type SecretVoidResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
export type VoidResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

declare global {
  interface Window {
    readonly dude?: DudeElectronBridge;
  }
}

export {};
