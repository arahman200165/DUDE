import { DEFAULT_APPEARANCE, type AppearancePrefs } from '@dude/domain/core/appearance/appearance.model';
import { favoriteItemId, type FavoriteItem } from '@dude/persistence/codecs/favorite.codec';
import type { ConsequenceClass } from '@dude/domain/shared/models/tool-metadata.model';

export type ActionResult<T = undefined> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };
export type SyncCategory = 'favorites' | 'settings';
export type SyncChoice = 'merge' | 'hub' | 'local';
export interface ConnectionInput { readonly pairingString: string; readonly displayName: string; readonly acknowledged: true }
export interface DestructivePreview {
  readonly token: string; readonly pending: number; readonly records?: number; readonly contextId?: string;
  readonly expiresInSeconds?: number; readonly consequences?: readonly ConsequenceClass[];
  readonly targetRecords?: number; readonly targetPending?: number;
}
export interface CachedEnvironment {
  readonly id: string; readonly environmentId: string; readonly deviceId: string; readonly kind: 'archive' | 'environment';
  readonly records: number; readonly pending: number; readonly selected: boolean;
}
export interface FirstSyncPreview {
  readonly id: string;
  readonly categories: readonly { readonly category: SyncCategory; readonly localCount: number; readonly hubCount: number }[];
  readonly confirmToken?: string;
  readonly authorityChange?: { readonly previousHubInstanceId: string; readonly previousEpoch: number; readonly previousHead: number; readonly hubInstanceId: string; readonly epoch: number };
}
export interface WorkbenchSnapshot {
  /** Retain unknown cached fields. Render through the shared appearance sanitizer only. */
  readonly appearance: Readonly<Record<string, unknown>>;
  readonly favorites: readonly FavoriteItem[];
  readonly durability: 'memory' | 'durable';
  readonly connection: {
    readonly kind: 'standalone' | 'connecting' | 'connected' | 'unreachable' | 'revoked' | 'untrusted-certificate' | 'incompatible' | 'reauth-required' | 'restore-repair-required';
    readonly detail: string;
    readonly environmentName?: string;
    readonly deviceName?: string;
  };
  readonly sync: {
    readonly phase: 'local-only' | 'needs-consent' | 'paused' | 'syncing' | 'live' | 'offline' | 'conflict' | 'revoked' | 'incompatible' | 'error';
    readonly detail: string;
    readonly pending: number;
    readonly conflicts: number;
    readonly categories?: readonly { readonly category: SyncCategory; readonly enabled: boolean; readonly detail?: string }[];
  };
  readonly firstSyncPreview?: FirstSyncPreview;
  readonly recovery?: {
    readonly contextId: string; readonly pendingAttempt: boolean; readonly archives: readonly CachedEnvironment[];
    readonly copies: readonly { readonly id: string; readonly reason: string; readonly createdAt: string; readonly contextId: string }[];
    readonly enrolledContextId?: string;
    readonly standaloneContextId: string;
    readonly warning?: string;
  };
  readonly capabilities: Readonly<Record<'appearance' | 'favorites' | 'connect' | 'disconnect' | 'sync' | 'recover' | 'clearCache' | 'exportRecovery', boolean>>;
}
export interface WorkbenchActions {
  patchAppearance(patch: Partial<AppearancePrefs>): Promise<ActionResult>;
  setFavorite(item: FavoriteItem, pinned: boolean): Promise<ActionResult>;
  connect(input: ConnectionInput): Promise<ActionResult>;
  previewDisconnect(): Promise<ActionResult<DestructivePreview>>;
  disconnect(token: string): Promise<ActionResult>;
  syncNow(): Promise<ActionResult>;
  previewSync(): Promise<ActionResult>;
  previewSyncApproval(choices: Readonly<Partial<Record<SyncCategory, SyncChoice>>>, previewId: string): Promise<ActionResult<DestructivePreview>>;
  approveSync(choices: Readonly<Partial<Record<SyncCategory, SyncChoice>>>, previewId: string, confirmToken?: string): Promise<ActionResult>;
  setSyncCategory(category: SyncCategory, enabled: boolean): Promise<ActionResult>;
  recover(): Promise<ActionResult>;
  exportRecovery(contextId?: string): Promise<ActionResult<{ readonly text: string }>>;
  exportRecoveryCopy(copyId: string): Promise<ActionResult<{ readonly text: string }>>;
  importRecovery(text: string): Promise<ActionResult>;
  selectArchive(contextId: string): Promise<ActionResult>;
  rePair(input: ConnectionInput, contextId?: string): Promise<ActionResult>;
  previewDiscardAttempt(): Promise<ActionResult<DestructivePreview>>;
  discardAttempt(token: string): Promise<ActionResult>;
  previewStandalone(contextId: string): Promise<ActionResult<DestructivePreview>>;
  continueStandalone(token: string, contextId: string): Promise<ActionResult>;
  previewClearCache(): Promise<ActionResult<DestructivePreview>>;
  clearCache(token: string): Promise<ActionResult>;
}
/** Storage/sync/lifecycle owners supply this port; scenes never open databases or call a Hub. */
export interface WorkbenchBackend {
  getSnapshot(): WorkbenchSnapshot;
  subscribe(listener: () => void): () => void;
  readonly actions: WorkbenchActions;
}
export const INITIAL_WORKBENCH: WorkbenchSnapshot = {
  appearance: { ...DEFAULT_APPEARANCE }, favorites: [], durability: 'memory',
  connection: { kind: 'standalone', detail: 'No Hub connected.' },
  sync: { phase: 'local-only', detail: 'Local only. Synchronization is not active.', pending: 0, conflicts: 0 },
  capabilities: { appearance: true, favorites: true, connect: false, disconnect: false, sync: false, recover: false, clearCache: false, exportRecovery: false },
};

/** A pin changes one record only; unrelated tools, pipelines and their order survive intact. */
export function updateFavorite(items: readonly FavoriteItem[], item: FavoriteItem, pinned: boolean): readonly FavoriteItem[] {
  if (!pinned) return items.filter(existing => existing.id !== item.id);
  if (items.some(existing => existing.id === item.id)) return items;
  return [...items, item];
}
export function newToolFavorite(items: readonly FavoriteItem[], toolId: string): FavoriteItem {
  return { id: favoriteItemId('tool', toolId), kind: 'tool', targetId: toolId, order: items.reduce((max, item) => Math.max(max, item.order), -1) + 1 };
}
export function patchAppearanceFields(raw: Readonly<Record<string, unknown>>, patch: Partial<AppearancePrefs>): Readonly<Record<string, unknown>> {
  return { ...raw, ...patch };
}

/** Honest intermediate shell implementation: memory edits, no enrollment or sync receipts. */
export function createMemoryWorkbench(initial: WorkbenchSnapshot = INITIAL_WORKBENCH): WorkbenchBackend {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const unavailable = async (): Promise<{ readonly ok: false; readonly reason: string }> => ({ ok: false, reason: 'This native action is not implemented yet.' });
  const publish = (next: WorkbenchSnapshot): ActionResult => {
    snapshot = next;
    listeners.forEach(listener => listener());
    return { ok: true, value: undefined };
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    actions: {
      patchAppearance: async patch => publish({ ...snapshot, appearance: patchAppearanceFields(snapshot.appearance, patch) }),
      setFavorite: async (item, pinned) => publish({ ...snapshot, favorites: updateFavorite(snapshot.favorites, item, pinned) }),
      connect: unavailable, previewDisconnect: unavailable, disconnect: unavailable, syncNow: unavailable, previewSync: unavailable, previewSyncApproval: unavailable,
      approveSync: unavailable, setSyncCategory: unavailable, recover: unavailable, exportRecovery: unavailable, exportRecoveryCopy: unavailable,
      previewClearCache: unavailable, clearCache: unavailable, importRecovery: unavailable, selectArchive: unavailable,
      rePair: unavailable, previewDiscardAttempt: unavailable, discardAttempt: unavailable, previewStandalone: unavailable, continueStandalone: unavailable,
    },
  };
}
