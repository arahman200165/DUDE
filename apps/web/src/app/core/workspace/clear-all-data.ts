import { Injectable, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { HistoryService } from '../history/history.service';
import { NetworkRunHistoryService } from '../platform/network-run-history.service';

/**
 * The one place "clear everything DUDE has saved on this device" goes through, so the sidebar's
 * button and Settings' button (Milestone 294) stay in sync as more storage backends join.
 * `PersistenceService` itself never learns about IndexedDB (it stays a localStorage/sessionStorage
 * abstraction only, preserving its single responsibility) — this is where the two are combined.
 */
@Injectable({ providedIn: 'root' })
export class ClearAllDataService {
  private readonly persistence = inject(PersistenceService);
  private readonly history = inject(HistoryService);
  private readonly networkHistory = inject(NetworkRunHistoryService);

  async clearAll(): Promise<void> {
    this.persistence.clearAll();
    await this.history.clearAll();
    await this.networkHistory.clear();
  }
}
