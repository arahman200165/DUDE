import type { LlmChatRequest, LlmChatResult } from "./llm-chat.model.js";
import type { SnapshotDiff, SnapshotHeader } from "../../fs/snapshot-diff.js";
import type { ChangeEvent, FolderWatchSettings, FolderWatchState, TimelineQuery, WatchedFolder } from "../../fs/watch-types.js";
import type { ApplyResult, FsJobEvent, FsJobRequest, FsResult, JournalEntry, MutationSettings, PickedFile, PickedSavePath, PlanPreview, RememberedFolder, SavePathRequest } from "../../fs/fs-types.js";
import type { PwshStatus, SysMethodMap, SysReadMethod, SysResult, SysStreamEvent } from "../../system/system-types.js";
import type { ScheduledTaskDetail, ScheduledTaskSummary } from "../../system/task-types.js";
import type { StartupProgramsResult } from "../../system/startup-types.js";
import type { InstalledSoftware } from "../../system/software-types.js";
import type { WindowsCapability, WindowsFeature } from "../../system/feature-types.js";
import type { SysApplyResult, SysJournalEntry, SysMutationSettings, SysMutResult, SysPlanPreview, SysPlanRequest, SysSnapshot, SysSnapshotHeader, SysSnapshotKind } from "../../system/sys-mutation-types.js";
import type { DeviceStoreBoot, DeviceStoreDevice, EntityCommit, EntityCommitResult, KvMutation, StoreHealth } from "../../device-store/device-store.model.js";
import type { NetworkRequest, NetworkJobEvent, NetworkStartResult, NetworkPrepareResult, WatchEntry, WatchSettings, WatchState, WatchResult } from "../../core/platform/network-types.js";
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

export interface PlatformBridge {
  readonly preferences: {
    get(): Promise<DesktopPreferences>;
    set(patch: Partial<DesktopPreferences>): Promise<{ readonly ok: true; readonly value: DesktopPreferences } | { readonly ok: false; readonly error: string }>;
    displays(): Promise<readonly { readonly id: number; readonly label: string; readonly primary: boolean }[]>;
    setupRequest(): Promise<string | null>;
  };
  readonly open: {
    ready(): void;
    pickFile(): Promise<{ readonly canceled: boolean }>;
    getPathForFile(file: unknown): string;
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
  /**
   * Device State Store broker (Phase 31B). Every call goes through main, which validates it; the
   * renderer never holds a store port. A degraded store hydrates empty and commits report `ok: false`.
   */
  readonly store: {
    hydrate(): Promise<DeviceStoreBoot>;
    commitKv(mutations: readonly KvMutation[]): Promise<{ readonly ok: true; readonly count: number } | { readonly ok: false; readonly error: string }>;
    /** One-way, fire and forget: for page-hide flushes where a reply cannot be awaited. */
    commitKvNoWait(mutations: readonly KvMutation[]): void;
    commitEntity(commit: EntityCommit): Promise<EntityCommitResult>;
    /** Upserts of a single entity type, committed in one transaction. */
    importEntities(commits: readonly EntityCommit[]): Promise<{ readonly ok: true; readonly count: number; readonly backpressure: boolean } | { readonly ok: false; readonly error: string }>;
    status(): Promise<StoreHealth>;
    /** Asks main to restart a stopped store service; resolves with the resulting health. */
    retry(): Promise<StoreHealth>;
    /** Main asks the renderer to flush pending writes before quit; the returned promise settles the handshake. */
    onFlushRequest(callback: () => void | Promise<void>): () => void;
    onHealth(callback: (health: StoreHealth) => void): () => void;
  };
  readonly device: {
    get(): Promise<DeviceStoreDevice | null>;
    rename(displayName: string): Promise<{ readonly ok: true; readonly displayName: string } | { readonly ok: false; readonly error: string }>;
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
    /** Native save dialog; the chosen path becomes a single-use write grant for that exact file. */
    pickSavePath(request?: SavePathRequest): Promise<PickedSavePath>;
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
    status(purpose: string): Promise<SecretStatusView>;
    set(purpose: string, value: string): Promise<SecretVoidResult>;
    remove(purpose: string): Promise<SecretVoidResult>;
  };
  readonly ai: {
    getConfig(): Promise<AiProviderConfigView | null>;
    setConfig(config: Partial<AiProviderConfig>): Promise<SecretVoidResult>;
  };
  readonly llm: {
    isConfigured(): Promise<boolean>;
    chat(request: LlmChatRequest): Promise<LlmChatResult>;
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
  /**
   * PowerShell Builder workbench (Milestone 612). `preview` returns the exact script, SHA-256, working directory and
   * elevation state; `confirm` issues a single-use ~60 s token bound to this window and that preview; only `run` starts
   * pwsh, and only with a fresh token. History is metadata only and can never rerun anything.
   */
  readonly powershell: {
    catalog(refresh?: boolean): Promise<{ readonly version: string; readonly commands: readonly import("../system/powershell-builder.js").PowerShellCmdletDefinition[] }>;
    /** A blank `cwd` means the user's home folder. */
    preview(script: string, cwd: string): Promise<import("../../system/powershell-types.js").PowerShellRunPreview>;
    discard(previewId: string): Promise<boolean>;
    confirm(previewId: string): Promise<{ readonly token: string; readonly expiresAt: string }>;
    run(previewId: string, token: string, timeoutMs?: number): Promise<{ readonly runId: string }>;
    cancel(runId: string): Promise<boolean>;
    history(): Promise<readonly import("../../system/powershell-types.js").PowerShellHistoryEntry[]>;
    clearHistory(): Promise<void>;
    onEvent(callback: (event: import("../../system/powershell-types.js").PowerShellRunEvent) => void): () => void;
  };
  readonly dependencyWalker: { walk(path: string): Promise<import("../../system/dependency-walker-types.js").DependencyNode> };
  readonly sys: {
    call<M extends SysReadMethod>(method: M, params: SysMethodMap[M]['params']): Promise<SysResult<SysMethodMap[M]['result']>>;
    pwshStatus(refresh?: boolean): Promise<PwshStatus>;
    taskList(): Promise<readonly ScheduledTaskSummary[]>;
    taskInfo(taskPath: string, taskName: string): Promise<ScheduledTaskDetail>;
    startupList(): Promise<StartupProgramsResult>;
    listInstalledSoftware(): Promise<InstalledSoftware[]>;
    featureList(): Promise<readonly WindowsFeature[]>;
    featureCapabilities(): Promise<readonly WindowsCapability[]>;
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
  /**
   * Process Diagnostic Bundle (Phase 31 Milestone 613). Main re-collects everything itself; `write` needs a
   * `savePath` freshly returned by `fs.pickSavePath` (a single-use write grant).
   */
  readonly sysBundle: {
    estimate(request: import("../../system/bundle-types.js").BundleEstimateRequest): Promise<import("../../system/bundle-types.js").BundleResult<import("../../system/bundle-types.js").BundleEstimate>>;
    write(request: import("../../system/bundle-types.js").BundleWriteRequest): Promise<import("../../system/bundle-types.js").BundleResult<import("../../system/bundle-types.js").BundleWriteResult>>;
    cancel(exportId: string): Promise<boolean>;
    reveal(path: string): Promise<boolean>;
    onProgress(callback: (event: import("../../system/bundle-types.js").BundleProgress) => void): () => void;
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
  /**
   * Runs a bounded set of discovered developer runtimes to capture their version output
   * (DUDE_PRD.md §21 Phase 31 Milestone 600). Each command is an absolute executable path plus
   * version-flag arguments; main validates and execFiles them (no shell), with a timeout. This is an
   * explicit, user-initiated code-execution action, never triggered by inspection.
   */
  readonly runtime: {
    probe(commands: readonly { readonly id: string; readonly exe: string; readonly args: readonly string[] }[]):
      Promise<readonly { readonly id: string; readonly ok: boolean; readonly stdout: string; readonly stderr: string; readonly exitCode: number | null; readonly error?: string }[]>;
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

/** What the renderer may know about a secret: presence and a masked hint, never the value. Structurally matches `@dude/persistence`'s `SecretStatus`. */
export interface SecretStatusView {
  readonly purpose: string;
  readonly isSet: boolean;
  readonly hint: string | null;
  readonly needsReentry: boolean;
  /** `store-unavailable` when the device store is down. */
  readonly error?: string;
}
export interface AiProviderConfig { readonly baseUrl: string; readonly model: string }
export interface AiProviderConfigView extends AiProviderConfig { readonly apiKey: SecretStatusView }
export type SecretVoidResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
export type VoidResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
