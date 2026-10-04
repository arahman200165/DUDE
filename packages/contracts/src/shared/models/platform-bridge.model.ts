import type { AuditListResponse, SecurityAlertsResponse, ReachabilityEchoResponse, ConfirmPreview, DeviceInfo, DeviceListResponse, OkResponse, PairingCodeResponse, RecoveryCodesResponse, SessionListResponse, SyncSummary, HubDiagnosticsReport } from "../../hub/index.js";
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
import type { AgentAppliedChange, AgentDiagnostics, AgentHistoryRecord, AgentNetworkRun, AgentStandalonePreview, AgentSyncStatus, FirstSyncChoice, FirstSyncPreview, QuarantinedOpExport, QuarantinedOpView, SyncCategoryFlags, SyncConflictChoice, SyncConflictView } from "../../device-store/agent-protocol.js";
import type { SyncCategory } from "../../hub/index.js";
import type { DeviceStoreBoot, DeviceStoreDevice, EntityCommit, EntityCommitResult, KvMutation, QuarantinePreviewResult, ResetApplyResult, ResetKind, ResetPreviewOptions, ResetPreviewResult, StoreHealth } from "../../device-store/device-store.model.js";
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

export type StoreRecordResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
export type StoreRecordAddResult = { readonly ok: true; readonly evicted: number } | { readonly ok: false; readonly error: string };

/** Result envelope of every `window.dude.hub` call: the main process never throws across the bridge. */
export type DesktopHubResult<T> = { readonly ok: true; readonly result: T } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string; readonly retryAfterMs?: number } };

export interface DesktopHubStatus {
  readonly enrollmentState: 'standalone' | 'enrolled' | 'revoked';
  readonly hubUrl: string | null;
  readonly environmentId: string | null;
  readonly hubInstanceId: string | null;
  readonly hubVersion: string | null;
  /** Whether the Hub answered its last reachability check; null when never checked or not enrolled. */
  readonly reachable: boolean | null;
  /** The agent's connection state when enrolled (richer than `reachable`); absent from older hosts and Hub-served builds. */
  readonly connection?: 'connecting' | 'online' | 'offline' | 'incompatible' | 'untrusted-tls';
  /** The last connection error text, when there is one. */
  readonly lastError?: string | null;
  readonly lastContactAt?: string | null;
  /** Whether the Hub trusts this device for owner recovery; null/absent until known. */
  readonly recoveryTrusted?: boolean | null;
}
/** Preview of installing the Hub's local-CA root into the current user's Trusted Root store (Windows only). Nothing changes until `installRootCertificate(confirmToken)`. */
export type DesktopRootCertificatePreview =
  | { readonly available: false; readonly reason: 'not-local-ca' | 'unsupported-platform' }
  | { readonly available: true; readonly fingerprint: string; readonly subject: string; readonly notAfter: string; readonly confirmToken: string };
export interface DesktopHubProbe {
  readonly found: boolean;
  readonly port: number | null;
  readonly hubInstanceId: string | null;
  readonly hubVersion: string | null;
  readonly bootstrapped: boolean | null;
}
export interface DesktopHubEnrollment {
  readonly deviceId: string;
  readonly environmentId: string;
  readonly hubInstanceId: string;
  readonly hubUrl: string;
}
export interface DesktopHubOwnerStatus {
  readonly signedIn: boolean;
  readonly ownerDisplayName: string | null;
  /** The hard expiry of the owner session; null when signed out. */
  readonly expiresAt: string | null;
}

/** What the desktop knows about the Hub on this machine (installed by the DUDE installer or by `dude-hub service install`). */
export interface DesktopLocalHubInfo {
  /** `dude-hub.exe` found in the Hub install directory. */
  readonly installed: boolean;
  readonly installDir: string | null;
  /** The Hub answered on 127.0.0.1. */
  readonly found: boolean;
  readonly bootstrapped: boolean | null;
  /** The running Hub's version, from its public hello. */
  readonly hubVersion: string | null;
  /** The Hub version bundled in this packaged desktop build; null in dev builds or when the build ships no Hub. */
  readonly bundledHubVersion: string | null;
  /** installed and a bundled Hub is newer than the running one. */
  readonly updateAvailable: boolean;
}
export interface DesktopLocalHubSetupRequest {
  readonly environmentName: string;
  readonly ownerDisplayName: string;
  readonly password: string;
}
export interface DesktopLocalHubSetupResult {
  /** Shown to the user once; the Hub keeps only hashes. */
  readonly recoveryCodes: readonly string[];
  readonly status: DesktopHubStatus;
  /** Set when the Hub was set up but pairing this device or signing in failed afterwards. */
  readonly followUpError?: { readonly code: string; readonly message: string };
}
export interface DesktopLocalHubUpdateResult {
  readonly fromVersion: string | null;
  readonly toVersion: string | null;
}

/**
 * Hub administration from the desktop shell. The main process holds the pinned-TLS transport and the owner
 * bearer session; the renderer never sees a Hub credential. Absent outside the desktop app.
 */
export interface DesktopHubBridge {
  status(): Promise<DesktopHubResult<DesktopHubStatus>>;
  probeLocal(port?: number): Promise<DesktopHubResult<DesktopHubProbe>>;
  enroll(pairingString: string): Promise<DesktopHubResult<DesktopHubEnrollment>>;
  unenroll(force?: boolean): Promise<DesktopHubResult<{ readonly unenrolled: boolean; readonly hubNotified: boolean }>>;
  ownerStatus(): Promise<DesktopHubResult<DesktopHubOwnerStatus>>;
  ownerSignIn(password: string): Promise<DesktopHubResult<DesktopHubOwnerStatus>>;
  ownerSignOut(): Promise<DesktopHubResult<OkResponse>>;
  listDevices(): Promise<DesktopHubResult<DeviceListResponse>>;
  syncSummary(): Promise<DesktopHubResult<SyncSummary>>;
  /** Owner session required (`owner-session-required`): the Hub's endpoint diagnostics report. View-only. */
  diagnostics(): Promise<DesktopHubResult<HubDiagnosticsReport>>;
  /** This device's own connection report (no owner session needed): state, pins, latency, clock skew, sync counts. */
  agentDiagnostics(): Promise<DesktopHubResult<AgentDiagnostics>>;
  /**
   * Device-side reachability probe: this device calls the Hub's echo route through the supplied PUBLIC origin (`https://name[:port]`),
   * authenticated with its device token. Error codes: `bad-request` (malformed address), `not-enrolled`, `untrusted-tls`, `hub-unreachable`, `hub-*`.
   */
  reachabilityEcho(publicUrl: string): Promise<DesktopHubResult<ReachabilityEchoResponse & { readonly rttMs: number }>>;
  createPairingCode(host?: string): Promise<DesktopHubResult<PairingCodeResponse>>;
  renameDevice(deviceId: string, displayName: string): Promise<DesktopHubResult<DeviceInfo>>;
  revokeDevicePreview(deviceId: string): Promise<DesktopHubResult<ConfirmPreview>>;
  revokeDevice(deviceId: string, confirmToken: string): Promise<DesktopHubResult<OkResponse>>;
  setRecoveryTrust(deviceId: string, password: string, trusted: boolean): Promise<DesktopHubResult<DeviceInfo>>;
  listSessions(): Promise<DesktopHubResult<SessionListResponse>>;
  revokeSession(sessionId: string): Promise<DesktopHubResult<OkResponse>>;
  revokeAllPreview(): Promise<DesktopHubResult<ConfirmPreview>>;
  revokeAll(confirmToken: string): Promise<DesktopHubResult<OkResponse>>;
  listAudit(beforeSeq?: number): Promise<DesktopHubResult<AuditListResponse>>;
  listSecurityAlerts(): Promise<DesktopHubResult<SecurityAlertsResponse>>;
  markSecurityAlertsSeen(upToSeq: number): Promise<DesktopHubResult<OkResponse>>;
  recoveryCodesPreview(): Promise<DesktopHubResult<ConfirmPreview>>;
  regenerateRecoveryCodes(confirmToken: string): Promise<DesktopHubResult<RecoveryCodesResponse>>;
  changePassword(currentPassword: string, newPassword: string): Promise<DesktopHubResult<OkResponse>>;
  /**
   * Device-assisted owner recovery (PD-029), from a recovery-trusted device only. Main runs the Windows Hello (CredUI
   * fallback) presence check first; error codes: `not-verified`, `unavailable`, `busy`, `not-trusted`,
   * `owner-recovery-failed`, `hub-*`. The caller must have completed its own two-step confirm before calling.
   */
  recoverOwner(newPassword: string): Promise<DesktopHubResult<OkResponse>>;
  /** The Hub on this machine: installed, running, bootstrapped, version, and whether a bundled update is available. */
  localHubInfo(): Promise<DesktopHubResult<DesktopLocalHubInfo>>;
  /**
   * First-run setup of the installed Hub: main UAC-elevates `dude-hub setup-token --deliver-to`, the agent consumes the
   * hand-off, bootstraps, pairs this device and signs the owner in. The setup token never reaches the renderer. Error
   * codes: `unsupported-platform`, `busy`, `not-installed`, `elevation-cancelled`, `elevation-failed`, `setup-token-failed`,
   * `handoff-missing`, `handoff-expired`, `already-bootstrapped`, `tls-pin-mismatch`, `hub-*`.
   */
  setupLocalHub(request: DesktopLocalHubSetupRequest): Promise<DesktopHubResult<DesktopLocalHubSetupResult>>;
  /** Updates the installed Hub from the Hub bundled in this build (UAC-elevated). Codes also include `unsupported-in-dev`, `no-update`, `update-failed`. */
  updateLocalHub(): Promise<DesktopHubResult<DesktopLocalHubUpdateResult>>;
  /** Opens the enrolled Hub's own web page in the default browser. Takes no URL: main resolves it and only opens `https:`. Codes: `not-enrolled`, `invalid-url`. */
  openWeb(): Promise<DesktopHubResult<{ readonly ok: true }>>;
  /** Step 1: fetches the Hub's public root over the pinned channel and returns its SHA-256 fingerprint plus a 60-second single-use token. Changes nothing. */
  rootCertificatePreview(): Promise<DesktopHubResult<DesktopRootCertificatePreview>>;
  /** Step 2: adds the previewed root to the CURRENT USER's Trusted Root store (`certutil -user`; Windows shows its own prompt). Codes: `stale-preview`, `expired`, `install-failed`, `unsupported-platform`. */
  installRootCertificate(confirmToken: string): Promise<DesktopHubResult<{ readonly installed: true }>>;
  /** Pushed by main whenever the Device Agent's Hub connection state changes. Returns the unsubscribe function. */
  onStatusChanged(callback: (status: DesktopHubStatus) => void): () => void;
}

/** Sync state and actions served by the Device Agent (Phase 31D). Same `{ ok, result | error }` envelope as the Hub bridge; main validates every argument. */
export interface DesktopSyncBridge {
  status(): Promise<DesktopHubResult<AgentSyncStatus>>;
  setCategories(categories: SyncCategoryFlags): Promise<DesktopHubResult<AgentSyncStatus>>;
  setPaused(paused: boolean): Promise<DesktopHubResult<AgentSyncStatus>>;
  syncNow(): Promise<DesktopHubResult<AgentSyncStatus>>;
  listConflicts(): Promise<DesktopHubResult<readonly SyncConflictView[]>>;
  resolveConflict(id: number, choice: SyncConflictChoice): Promise<DesktopHubResult<{ readonly ok: true; readonly changes: readonly AgentAppliedChange[] } | { readonly ok: false; readonly error: string }>>;
  listQuarantined(): Promise<DesktopHubResult<readonly QuarantinedOpView[]>>;
  /** Omit `opIds` to retry every quarantined op. */
  retryQuarantined(opIds?: readonly string[]): Promise<DesktopHubResult<{ readonly retried: number }>>;
  discardQuarantinedPreview(opId: string): Promise<DesktopHubResult<ConfirmPreview>>;
  discardQuarantined(opId: string, confirmToken: string): Promise<DesktopHubResult<{ readonly ok: true }>>;
  exportQuarantined(): Promise<DesktopHubResult<readonly QuarantinedOpExport[]>>;
  firstSyncPreview(): Promise<DesktopHubResult<FirstSyncPreview>>;
  firstSyncApply(choices: Partial<Record<SyncCategory, FirstSyncChoice>>, digest: string, confirmToken?: string): Promise<DesktopHubResult<AgentSyncStatus>>;
  standalonePreview(): Promise<DesktopHubResult<AgentStandalonePreview>>;
  standaloneApply(confirmToken: string, digest: string): Promise<DesktopHubResult<AgentSyncStatus>>;
  /** Pushed by main whenever the sync status changes. Returns the unsubscribe function. */
  onStatusChanged(callback: (status: AgentSyncStatus) => void): () => void;
  /** Pushed after remote changes (or a conflict resolution) were written locally, so the renderer can refresh its copies. */
  onApplied(callback: (changes: readonly AgentAppliedChange[]) => void): () => void;
}

export interface PlatformBridge {
  /** Absent until the Electron main/preload implementation of Hub administration ships. */
  readonly hub?: DesktopHubBridge;
  /** Absent until the Electron main/preload implementation of sync ships. */
  readonly sync?: DesktopSyncBridge;
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
    /** Two-step reset (Destructive-Action Contract): `preview` changes nothing; `apply` needs its single-use token. */
    readonly reset: {
      preview(kind: ResetKind, options?: ResetPreviewOptions): Promise<ResetPreviewResult>;
      apply(request: { readonly kind: ResetKind; readonly token: string; readonly deleteFromHub?: boolean }): Promise<ResetApplyResult>;
    };
    /** Recovery for an unusable store. Main picks every path; the renderer supplies none. */
    readonly recovery: {
      openFolder(): Promise<{ readonly ok: boolean }>;
      quarantinePreview(): Promise<QuarantinePreviewResult>;
      quarantineApply(token: string): Promise<ResetApplyResult>;
    };
    /** Main asks the renderer to flush pending writes before quit; the returned promise settles the handshake. */
    onFlushRequest(callback: () => void | Promise<void>): () => void;
    onHealth(callback: (health: StoreHealth) => void): () => void;
    /** Local History in the device store (Phase 31B). The store enforces the retention caps in each add. */
    readonly history: {
      add(entry: AgentHistoryRecord): Promise<StoreRecordAddResult>;
      /** Newest first; with a `toolId` only that tool's entries. */
      list(query?: { readonly toolId?: string; readonly limit?: number }): Promise<readonly AgentHistoryRecord[]>;
      get(id: string): Promise<AgentHistoryRecord | null>;
      remove(id: string): Promise<StoreRecordResult>;
      clear(): Promise<StoreRecordResult>;
      clearTool(toolId: string): Promise<StoreRecordResult>;
    };
    /** Saved network runs in the device store; the renderer scrubs secrets before `add`. */
    readonly network: {
      add(run: AgentNetworkRun): Promise<StoreRecordAddResult>;
      list(query?: { readonly limit?: number }): Promise<readonly AgentNetworkRun[]>;
      get(id: string): Promise<AgentNetworkRun | null>;
      remove(id: string): Promise<StoreRecordResult>;
      clear(): Promise<StoreRecordResult>;
    };
  };
  readonly device: {
    get(): Promise<DeviceStoreDevice | null>;
    rename(displayName: string): Promise<{ readonly ok: true; readonly displayName: string } | { readonly ok: false; readonly error: string }>;
    /** The resident background Device Agent (desktop only, Settings > This Device). */
    agentStatus(): Promise<BackgroundAgentStatus>;
    /** Turns "start at sign-in" on or off for the background agent and remembers the choice. */
    setAgentAutostart(enabled: boolean): Promise<BackgroundAgentResult>;
    /** Stops the background agent. The device store is unavailable until it is started again. */
    stopAgent(): Promise<BackgroundAgentResult>;
    /** Starts the background agent again after a stop. */
    startAgent(): Promise<BackgroundAgentResult>;
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
/** `unsupported-in-dev`: an unpackaged build never installs a sign-in entry. */
export type BackgroundAgentAutostart = 'enabled' | 'disabled' | 'unsupported-in-dev' | 'unsupported-platform';
export interface BackgroundAgentStatus {
  /** An authenticated connection to a running agent exists. */
  readonly running: boolean;
  /** The user stopped it from Settings and it has not been started again. */
  readonly stoppedByUser: boolean;
  readonly autostart: BackgroundAgentAutostart;
  /** What starts it at sign-in, when enabled. */
  readonly mechanism: 'task' | 'run-key' | null;
}
export type BackgroundAgentResult = { readonly ok: true; readonly status: BackgroundAgentStatus } | { readonly ok: false; readonly error: string };
export interface AiProviderConfig { readonly baseUrl: string; readonly model: string }
export interface AiProviderConfigView extends AiProviderConfig { readonly apiKey: SecretStatusView }
export type SecretVoidResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
export type VoidResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
