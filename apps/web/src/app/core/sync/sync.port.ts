import { InjectionToken, inject } from '@angular/core';
import type {
  AgentAppliedChange, AgentStandalonePreview, AgentSyncStatus, FirstSyncChoice, FirstSyncPreview, QuarantinedOpExport, QuarantinedOpView, SyncCategoryFlags,
  SyncConflictChoice, SyncConflictView,
} from '@dude/contracts';
import type { ConfirmPreview } from '@dude/contracts/hub';
import type { DesktopHubResult, DesktopSyncBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import type { SyncCategory } from '@dude/sync';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { PlatformService } from '../platform/platform.service';

/** Every sync failure, whichever host produced it. `unavailable` means this host has no sync engine. */
export class SyncError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

export const SYNC_UNAVAILABLE = 'unavailable';
/** The Agent's code when the Hub changed between a first-sync preview and its apply. */
export const FIRST_SYNC_STALE = 'first-sync-stale';

export type ConflictResolution = { readonly ok: true; readonly changes: readonly AgentAppliedChange[] } | { readonly ok: false; readonly error: string };

/** Sync as the Settings section and shell indicator see it. Methods reject with `SyncError`. */
export interface SyncPort {
  status(): Promise<AgentSyncStatus>;
  setCategories(categories: SyncCategoryFlags): Promise<AgentSyncStatus>;
  setPaused(paused: boolean): Promise<AgentSyncStatus>;
  syncNow(): Promise<AgentSyncStatus>;
  listConflicts(): Promise<readonly SyncConflictView[]>;
  resolveConflict(id: number, choice: SyncConflictChoice): Promise<ConflictResolution>;
  listQuarantined(): Promise<readonly QuarantinedOpView[]>;
  retryQuarantined(opIds?: readonly string[]): Promise<{ readonly retried: number }>;
  discardQuarantinedPreview(opId: string): Promise<ConfirmPreview>;
  discardQuarantined(opId: string, confirmToken: string): Promise<{ readonly ok: true }>;
  exportQuarantined(): Promise<readonly QuarantinedOpExport[]>;
  firstSyncPreview(): Promise<FirstSyncPreview>;
  firstSyncApply(choices: Partial<Record<SyncCategory, FirstSyncChoice>>, digest: string, confirmToken?: string): Promise<AgentSyncStatus>;
  standalonePreview(): Promise<AgentStandalonePreview>;
  standaloneApply(confirmToken: string, digest: string): Promise<AgentSyncStatus>;
  onStatusChanged(callback: (status: AgentSyncStatus) => void): () => void;
  onApplied(callback: (changes: readonly AgentAppliedChange[]) => void): () => void;
}

/**
 * Desktop adapter over `window.dude.sync`. The bridge is looked up per call (it may appear after preload) and a thrown
 * IPC failure is normalized the same way as an error result.
 */
export function createDesktopSyncAdapter(bridge: () => DesktopSyncBridge | undefined): SyncPort {
  async function run<T>(call: (sync: DesktopSyncBridge) => Promise<DesktopHubResult<T>>): Promise<T> {
    const sync = bridge();
    if (sync === undefined) throw new SyncError(SYNC_UNAVAILABLE, 'The desktop sync bridge is not available.');
    let result: DesktopHubResult<T>;
    try {
      result = await call(sync);
    } catch (error) {
      throw new SyncError('internal', error instanceof Error ? error.message : 'The sync request failed.');
    }
    if (!result.ok) throw new SyncError(result.error.code, result.error.message);
    return result.result;
  }
  return {
    status: () => run((s) => s.status()),
    setCategories: (c) => run((s) => s.setCategories(c)),
    setPaused: (p) => run((s) => s.setPaused(p)),
    syncNow: () => run((s) => s.syncNow()),
    listConflicts: () => run((s) => s.listConflicts()),
    resolveConflict: (id, choice) => run((s) => s.resolveConflict(id, choice)),
    listQuarantined: () => run((s) => s.listQuarantined()),
    retryQuarantined: (ids) => run((s) => s.retryQuarantined(ids)),
    discardQuarantinedPreview: (id) => run((s) => s.discardQuarantinedPreview(id)),
    discardQuarantined: (id, token) => run((s) => s.discardQuarantined(id, token)),
    exportQuarantined: () => run((s) => s.exportQuarantined()),
    firstSyncPreview: () => run((s) => s.firstSyncPreview()),
    firstSyncApply: (choices, digest, token) => run((s) => s.firstSyncApply(choices, digest, token)),
    standalonePreview: () => run((s) => s.standalonePreview()),
    standaloneApply: (token, digest) => run((s) => s.standaloneApply(token, digest)),
    onStatusChanged: (callback) => bridge()?.onStatusChanged(callback) ?? (() => undefined),
    onApplied: (callback) => bridge()?.onApplied(callback) ?? (() => undefined),
  };
}

/** Sync for the current host: the Device Agent through the desktop bridge, or null (web build, or a desktop without the sync bridge). */
export const SYNC_PORT = new InjectionToken<SyncPort | null>('DUDE sync', {
  providedIn: 'root',
  factory: () => {
    const platform = inject(PlatformService);
    const bridge = inject(PLATFORM_BRIDGE);
    if (!platform.isDesktop() || bridge.get()?.sync === undefined) return null;
    return createDesktopSyncAdapter(() => bridge.get()?.sync);
  },
});
