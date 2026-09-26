import { Injectable, computed, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import {
  EMPTY_NATIVE_RECENTS_STORE,
  NativeRecentEntry,
  migrateNativeRecentsStore,
  recordNativeRecent,
  removeNativeRecent,
} from './native-recent.model';

/**
 * Native File Recent List (DUDE_PRD.md §21 Phase 25 Item 5) -- `'__native-recents__'` is a synthetic
 * pseudo-tool-id, the same trick `'__workspace__'`/`'__projects__'` already use. `enabled` is a
 * separate signal under its own key (mirrors `WorkspaceLayoutService.reopenOnRestart`'s shape) so an
 * opt-out only ever affects future recordings, never retroactively purging what's already stored.
 * See `AGENTS.md` in this directory.
 */
@Injectable({ providedIn: 'root' })
export class NativeRecentsService {
  private readonly persistence = inject(PersistenceService);
  private readonly store = this.persistence.signal('__native-recents__', 'entries', 'local', EMPTY_NATIVE_RECENTS_STORE);
  readonly enabled = this.persistence.signal('__native-recents__', 'enabled', 'local', true);

  constructor() {
    const migrated = migrateNativeRecentsStore(this.store());
    if (migrated !== this.store()) this.store.set(migrated);
  }

  readonly entries = computed(() => this.store().entries);

  /** A no-op when opted out -- the flag only ever gates future recordings, per the governing rule above. */
  record(entry: NativeRecentEntry): void {
    if (!this.enabled()) return;
    this.store.set(recordNativeRecent(this.store(), entry));
  }

  remove(path: string): void {
    this.store.set(removeNativeRecent(this.store(), path));
  }

  clearAll(): void {
    this.store.set(EMPTY_NATIVE_RECENTS_STORE);
  }
}
