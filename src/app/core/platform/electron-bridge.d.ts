import type { SnapshotDiff, SnapshotHeader } from '../../../shared-logic/fs/snapshot-diff';
import type { ChangeEvent, FolderWatchSettings, FolderWatchState, TimelineQuery, WatchedFolder } from '../../../shared-logic/fs/watch-types';
import type { ApplyResult, FsJobEvent, FsJobRequest, FsResult, JournalEntry, MutationSettings, PickedFile, PlanPreview, RememberedFolder } from '../../../shared-logic/fs/fs-types';
import type { PwshStatus, SysMethodMap, SysReadMethod, SysResult, SysStreamEvent } from '../../../shared-logic/system/system-types';
import type { SysApplyResult, SysJournalEntry, SysMutationSettings, SysMutResult, SysPlanPreview, SysPlanRequest, SysSnapshot, SysSnapshotHeader, SysSnapshotKind } from '../../../shared-logic/system/sys-mutation-types';
import type { NetworkRequest, NetworkJobEvent, NetworkStartResult, NetworkPrepareResult, WatchEntry, WatchSettings, WatchState, WatchResult } from './network-types';
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
  readonly external: {
    /** Opens an http(s) link in the default browser; main re-validates and refuses anything else. */
    open(url: string): Promise<VoidResult>;
  };
  readonly appearance?: {
    /** Syncs Electron's native theme source and window background; main validates and may reject. */
    setNative(mode: 'dark' | 'light', background: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }>;
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
    pickDirectory(defaultPath?: string): Promise<{ readonly canceled: true } | { readonly canceled: false; readonly rootPath: string; readonly rootName: string }>;
    pickFile(defaultPath?: string): Promise<{ readonly canceled: true } | ({ readonly canceled: false } & PickedFile)>;
    readRange(rootPath: string, relativePath: string, offset: number, length: number): Promise<NativeFsResult<{ data: ArrayBuffer; size: number }>>;
    listRemembered(): Promise<readonly RememberedFolder[]>;
    remember(rootPath: string): Promise<FsResult<{ folders: readonly RememberedFolder[] }>>;
    forget(rootPath: string): Promise<FsResult<{ folders: readonly RememberedFolder[] }>>;
    isGranted(rootPath: string): Promise<boolean>;
    walk(rootPath: string): Promise<NativeFsResult<{ entries: readonly { readonly path: string; readonly size: number }[] }>>;
    readFile(rootPath: string, relativePath: string): Promise<NativeFsResult<{ data: ArrayBuffer }>>;
    readdir(rootPath: string, relativePath: string): Promise<NativeFsResult<{ names: readonly string[] }>>;
    stat(rootPath: string, relativePath: string, followSymlink: boolean): Promise<NativeFsResult<{ stat: NativeStat }>>;
  };
  readonly fsJobs: {
    start(request: FsJobRequest): Promise<FsResult<{ jobId: string }>>;
    cancel(jobId: string): Promise<boolean>;
    onEvent(callback: (event: FsJobEvent) => void): () => void;
  };
  readonly fsWatch: {
    get(): Promise<FsResult<{ value: FolderWatchState }>>;
    add(path: string, folder: Partial<WatchedFolder>): Promise<FsResult<{ value: FolderWatchState }>>;
    update(id: string, patch: Partial<WatchedFolder>): Promise<FsResult<{ value: FolderWatchState }>>;
    remove(id: string): Promise<FsResult<{ value: FolderWatchState }>>;
    setSettings(patch: Partial<FolderWatchSettings>): Promise<FsResult<{ value: FolderWatchState }>>;
    timeline(query: TimelineQuery): Promise<FsResult<{ value: readonly ChangeEvent[] }>>;
    clearTimeline(id: string): Promise<FsResult<{ value: FolderWatchState }>>;
    clearContent(id: string): Promise<FsResult<{ value: FolderWatchState }>>;
    content(id: string, hash: string): Promise<FsResult<{ value: { size: number; text: string | null; binary: boolean } }>>;
    onChanged(callback: (state: FolderWatchState) => void): () => void;
  };
  readonly fsSnapshots: {
    list(): Promise<FsResult<{ value: readonly SnapshotHeader[] }>>;
    export(id: string): Promise<FsResult<{ value: string }>>;
    import(json: string): Promise<FsResult<{ value: SnapshotHeader }>>;
    delete(id: string): Promise<FsResult<{ value: void }>>;
    compare(baseId: string, compareId: string): Promise<FsResult<{ value: SnapshotDiff }>>;
  };
  readonly fsMutation: {
    planTrash(root: string, paths: readonly string[], tool: string, title: string): Promise<FsResult<{ value: PlanPreview }>>;
    planWriteText(root: string, relativePath: string, text: string, tool: string): Promise<FsResult<{ value: PlanPreview }>>;
    planUndo(planId: string): Promise<FsResult<{ value: PlanPreview }>>;
    issueToken(planId: string): Promise<FsResult<{ token: string; expiresAt: string }>>;
    apply(planId: string, token: string, options?: { acceptNoUndo?: boolean }): Promise<FsResult<{ value: ApplyResult }>>;
    cancelApply(planId: string): Promise<boolean>;
    discard(planId: string): Promise<boolean>;
    journal(): Promise<FsResult<{ value: readonly JournalEntry[] }>>;
    getSettings(): Promise<FsResult<{ value: { settings: MutationSettings; backupBytes: number } }>>;
    setSettings(patch: Partial<MutationSettings>): Promise<FsResult<{ value: MutationSettings }>>;
    purgeBackups(planId?: string): Promise<FsResult<{ value: void }>>;
    onProgress(callback: (event: { readonly planId: string; readonly done: number; readonly total: number }) => void): () => void;
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
    watch(rootPath: string, relativePath: string, recursive?: boolean): Promise<{ readonly ok: true; readonly watchId: string } | { readonly ok: false; readonly error: string }>;
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
    readonly watch: {
      get(): Promise<WatchResult<{ state: WatchState }>>;
      upsert(entry: Partial<WatchEntry>): Promise<WatchResult<{ entry: WatchEntry }>>;
      remove(id: string): Promise<WatchResult>;
      clearPrepare(): Promise<WatchResult<{ token: string; count: number }>>;
      clearConfirm(token: string): Promise<WatchResult>;
      setSettings(settings: Partial<WatchSettings>): Promise<WatchResult<{ state: WatchState }>>;
      checkNow(id?: string): Promise<WatchResult<{ state: WatchState }>>;
      export(): Promise<WatchResult<{ json: string }>>;
      import(json: string): Promise<WatchResult<{ state: WatchState }>>;
      onChanged(callback: (state: WatchState) => void): () => void;
    };
  };
  /** Windows system reads through the `windows-sys.exe` helper (DUDE_PRD.md §21 Phase 31, Milestone 593). */
  readonly sys: {
    call<M extends SysReadMethod>(method: M, params: SysMethodMap[M]['params']): Promise<SysResult<SysMethodMap[M]['result']>>;
    pwshStatus(refresh?: boolean): Promise<PwshStatus>;
    onEvent(callback: (event: SysStreamEvent) => void): () => void;
  };
  /**
   * Windows system changes through the previewed, confirmed, journaled engine (DUDE_PRD.md §5.2.1,
   * Phase 31 Milestone 594). `apply` needs a single-use token from `issueToken`, which in turn needs
   * the exact typed names for any critical target.
   */
  readonly sysMutation: {
    plan(request: SysPlanRequest): Promise<SysMutResult<SysPlanPreview>>;
    planUndo(planId: string): Promise<SysMutResult<SysPlanPreview>>;
    issueToken(planId: string, typed: readonly string[]): Promise<SysMutResult<{ token: string; expiresAt: string }>>;
    apply(planId: string, token: string, options?: { acceptNoUndo?: boolean }): Promise<SysMutResult<SysApplyResult>>;
    cancelApply(planId: string): Promise<boolean>;
    discard(planId: string): Promise<boolean>;
    journal(): Promise<SysMutResult<readonly SysJournalEntry[]>>;
    getSettings(): Promise<SysMutResult<{ settings: SysMutationSettings; backupBytes: number }>>;
    setSettings(patch: Partial<SysMutationSettings>): Promise<SysMutResult<SysMutationSettings>>;
    purgeBackups(planId?: string): Promise<SysMutResult<void>>;
    onProgress(callback: (event: { readonly planId: string; readonly done: number; readonly total: number }) => void): () => void;
  };
  /** The userData snapshot library behind Phase 31's env/PATH/registry/process-environment diffs. */
  readonly sysSnapshots: {
    list(kind?: SysSnapshotKind): Promise<SysMutResult<readonly SysSnapshotHeader[]>>;
    get(kind: SysSnapshotKind, id: string): Promise<SysMutResult<SysSnapshot>>;
    save(kind: SysSnapshotKind, name: string, source: string, data: unknown): Promise<SysMutResult<SysSnapshotHeader>>;
    remove(kind: SysSnapshotKind, id: string): Promise<SysMutResult<void>>;
    exportJson(kind: SysSnapshotKind, id: string): Promise<SysMutResult<string>>;
    importJson(json: string): Promise<SysMutResult<SysSnapshotHeader>>;
    usage(): Promise<SysMutResult<{ count: number; bytes: number }>>;
  };
  /** Session elevation state and the deliberate Relaunch as Administrator action (Phase 27, shared from Phase 31). */
  readonly elevation: {
    status(): Promise<boolean>;
    relaunch(): Promise<boolean>;
  };
  readonly update: {
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

export type FileWatchEvent = { readonly id: string; readonly kind: 'changed'; readonly relativePath?: string | null } | { readonly id: string; readonly kind: 'error'; readonly error: string };

export type SecretResult<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: string };
export type SecretVoidResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
export type VoidResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

declare global {
  interface Window {
    readonly dude?: DudeElectronBridge;
  }
}

export {};
