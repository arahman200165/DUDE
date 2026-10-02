import { Injectable, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { HISTORY_DB_NAME, HISTORY_REPOSITORY } from '../history/history-repository';
import { HistoryService } from '../history/history.service';
import { NETWORK_HISTORY_DB_NAME, NETWORK_RUN_REPOSITORY } from '../platform/network-run-repository';
import { NetworkRunHistoryService } from '../platform/network-run-history.service';
import { deleteLegacyDatabase } from '../storage/legacy-indexeddb-import';

/**
 * The one place "clear everything DUDE has saved on this device" goes through, so the sidebar's
 * button and Settings' button (Milestone 294) stay in sync as more storage backends join.
 * `PersistenceService` itself never learns about IndexedDB (it stays a localStorage/sessionStorage
 * abstraction only, preserving its single responsibility) — this is where the two are combined.
 * History and saved network runs clear through their repositories (the device store on desktop);
 * on desktop any leftover pre-store IndexedDB databases are deleted as well.
 */
@Injectable({ providedIn: 'root' })
export class ClearAllDataService {
  private readonly persistence = inject(PersistenceService);
  private readonly history = inject(HistoryService);
  private readonly networkHistory = inject(NetworkRunHistoryService);
  private readonly historyRepository = inject(HISTORY_REPOSITORY);
  private readonly networkRepository = inject(NETWORK_RUN_REPOSITORY);

  async clearAll(): Promise<void> {
    this.persistence.clearAll();
    await this.history.clearAll();
    await this.networkHistory.clear();
    if (this.historyRepository.kind === 'device') await deleteLegacyDatabase(HISTORY_DB_NAME).catch(() => undefined);
    if (this.networkRepository.kind === 'device') await deleteLegacyDatabase(NETWORK_HISTORY_DB_NAME).catch(() => undefined);
  }
}
