import { Injectable, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { EMPTY_USAGE_STORE, UsageLogEntry, migrateUsageStore, recordUsage } from './usage.model';

/**
 * Local usage tracking (DUDE_PRD.md §21 Phase 24 Items 5/6/14) — uniform across all 277 tools,
 * unlike History: only `{toolId, count, lastUsedAt}` is ever stored, never tool content, so there
 * is no sensitivity gradient and no per-tool opt-in. `'__usage__'` is a synthetic pseudo-tool-id,
 * the same trick `'__workspace__'`/`'__pipelines__'` already use, which gets this store
 * `PersistenceService.clearAll()` participation for free. See `AGENTS.md` in this directory.
 */
@Injectable({ providedIn: 'root' })
export class UsageService {
  private readonly persistence = inject(PersistenceService);
  private readonly store = this.persistence.signal('__usage__', 'activity', 'local', EMPTY_USAGE_STORE);

  constructor() {
    const migrated = migrateUsageStore(this.store());
    if (migrated !== this.store()) this.store.set(migrated);
  }

  recordOpen(toolId: string): void {
    this.store.set(recordUsage(this.store(), toolId, new Date().toISOString()));
  }

  frequencyOf(toolId: string): number {
    return this.store().counts[toolId]?.count ?? 0;
  }

  mostFrequent(limit: number): readonly string[] {
    return Object.entries(this.store().counts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, limit)
      .map(([toolId]) => toolId);
  }

  /** Most recently opened tool ids, de-duplicated, most recent first. */
  mostRecent(limit: number): readonly string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (let i = this.store().recentLog.length - 1; i >= 0 && ordered.length < limit; i--) {
      const { toolId } = this.store().recentLog[i];
      if (seen.has(toolId)) continue;
      seen.add(toolId);
      ordered.push(toolId);
    }
    return ordered;
  }

  /** The raw, ordered (oldest-first) open log — for sequence-mining consumers (Milestones 411/412/419). */
  recentLogRaw(): readonly UsageLogEntry[] {
    return this.store().recentLog;
  }
}
