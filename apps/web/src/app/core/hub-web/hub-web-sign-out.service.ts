import { Injectable, inject } from '@angular/core';
import { wipeHubWebOrigin, type WipeIdb } from '@dude/persistence';
import { hardNavigate } from '../hub/hub-app-entry';
import { HISTORY_DB_NAME } from '../history/history-repository';
import { NETWORK_HISTORY_DB_NAME } from '../platform/network-run-repository';
import { HubWebConnectionService } from './hub-web-connection.service';
import { HubWebSyncInfo } from './hub-web-sync-info';

/** Every IndexedDB database the web app creates by name (history and network history). */
export const KNOWN_INDEXED_DB_NAMES: readonly string[] = [HISTORY_DB_NAME, NETWORK_HISTORY_DB_NAME];

/** `indexedDB.deleteDatabase` as a promise; `blocked` resolves too (the delete completes once the page's connections close). */
function browserIdb(factory: IDBFactory): WipeIdb {
  return {
    databases: typeof factory.databases === 'function' ? () => factory.databases() : undefined,
    deleteDatabase: (name) =>
      new Promise<void>((resolve, reject) => {
        const request = factory.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onblocked = () => resolve();
        request.onerror = () => reject(request.error);
      }),
  };
}

/**
 * Hub web sign-out, after the Hub accepted it (PD-053): stop the realtime link and the kv timers, lock writes, wipe
 * this origin's browser storage (installation id included) and load the sign-in page fresh. Session expiry never comes
 * through here: it only navigates to sign-in and keeps local data.
 */
@Injectable({ providedIn: 'root' })
export class HubWebSignOut {
  private readonly info = inject(HubWebSyncInfo);
  private readonly connection = inject(HubWebConnectionService);

  async completeSignOut(): Promise<void> {
    this.info.stopAll();
    this.connection.set('session-expired');
    await wipeHubWebOrigin({
      local: localStorage,
      session: sessionStorage,
      idb: typeof indexedDB === 'undefined' ? undefined : browserIdb(indexedDB),
      knownDatabases: KNOWN_INDEXED_DB_NAMES,
    });
    // Anything that wrote between the wipe and the unload (an appearance effect, a flushing signal) goes too.
    window.addEventListener('pagehide', () => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // storage unavailable
      }
    }, { once: true });
    await hardNavigate('/hub/sign-in');
  }
}
