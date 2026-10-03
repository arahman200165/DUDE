import type { AgentAppliedChange, AgentSyncPhase, AgentSyncStatus, SyncCategoryFlags } from '@dude/contracts';
import type { SyncCategory } from '@dude/sync';
import { SyncError, type SyncPort } from '../sync/sync.port';
import type { HubWebConnectionService, HubWebConnectionState } from './hub-web-connection.service';
import type { HubWebSyncInfo } from './hub-web-sync-info';
import type { HubWebAccess, HubWebClient } from './hub-web.types';

export const SYNC_UNSUPPORTED = 'unsupported';

export interface HubWebSyncAdapterDeps {
  readonly client: Pick<HubWebClient, 'webAccessSet'>;
  readonly connection: Pick<HubWebConnectionService, 'state' | 'subscribe'>;
  readonly info: HubWebSyncInfo;
  /** Web access per category as this page booted; updated as the owner toggles them. */
  readonly access: HubWebAccess;
}

/** The shared sync phases the browser can be in. `revoked` = session expired and `hub-outdated` = incompatible, per `describeSync`'s web wording. */
export function phaseOf(state: HubWebConnectionState, pulling: boolean): AgentSyncPhase {
  switch (state) {
    case 'live': return pulling ? 'syncing' : 'idle';
    case 'reconnecting':
    case 'unreachable': return 'offline';
    case 'session-expired': return 'revoked';
    case 'incompatible': return 'hub-outdated';
  }
}

const unsupported = (what: string): Promise<never> => Promise.reject(new SyncError(SYNC_UNSUPPORTED, `${what} is not available in the browser.`));

/**
 * Browser `SyncPort` (PD-054). The status is the connection state plus what the realtime link has read; `setCategories`
 * is the environment's web access (it applies to every browser signed in to the Hub, never to desktops); `syncNow`
 * pulls the change feed. The browser has no outbox, no persistent conflict inbox (conflicts are settled in the dialog
 * the moment they happen), no quarantine and no first sync (the Hub wins on first sign-in). Remote changes are applied
 * by the realtime link straight into `RemoteChangesService`, so `onApplied` never fires here: that keeps one apply path.
 */
export function createHubWebSyncAdapter(deps: HubWebSyncAdapterDeps): SyncPort {
  const { client, connection, info } = deps;
  const access: Record<SyncCategory, boolean> = { ...deps.access } as Record<SyncCategory, boolean>;

  const status = (): AgentSyncStatus => {
    const state = connection.state();
    return {
      phase: phaseOf(state, info.pulling),
      lastSyncAt: info.lastPullAt ?? info.lastPushAt,
      cursor: info.cursor,
      headRevision: info.head,
      pending: 0, held: 0, quarantined: 0, stranded: 0, conflicts: 0,
      categories: { ...access },
      lastError: state === 'live' ? null : state,
    };
  };

  return {
    host: 'web',
    status: async () => status(),
    async setCategories(flags: SyncCategoryFlags) {
      for (const [id, enabled] of Object.entries(flags) as [SyncCategory, boolean | undefined][]) {
        if (enabled === undefined || access[id] === enabled) continue;
        try {
          const response = await client.webAccessSet(id, enabled);
          Object.assign(access, response.access);
        } catch (error) {
          throw new SyncError('internal', error instanceof Error ? error.message : 'The Hub did not accept that change.');
        }
      }
      return status();
    },
    setPaused: () => unsupported('Pausing sync'),
    async syncNow() {
      await info.pullNow();
      return status();
    },
    listConflicts: async () => [],
    resolveConflict: async () => ({ ok: false, error: 'Conflicts are resolved where they happen in the browser.' }),
    listQuarantined: async () => [],
    retryQuarantined: async () => ({ retried: 0 }),
    discardQuarantinedPreview: () => unsupported('Quarantine'),
    discardQuarantined: () => unsupported('Quarantine'),
    exportQuarantined: async () => [],
    firstSyncPreview: () => unsupported('First sync'),
    firstSyncApply: () => unsupported('First sync'),
    standalonePreview: () => unsupported('Continuing standalone'),
    standaloneApply: () => unsupported('Continuing standalone'),
    onStatusChanged(callback) {
      const emit = (): void => callback(status());
      const offConnection = connection.subscribe(emit);
      const offInfo = info.subscribe(emit);
      return () => { offConnection(); offInfo(); };
    },
    onApplied: (_callback: (changes: readonly AgentAppliedChange[]) => void) => () => undefined,
  };
}
