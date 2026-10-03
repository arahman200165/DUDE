import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { usageCodec } from '@dude/persistence';
import { ENTITY_STORE } from '../persistence/entities/entity-store';
import { BOOT_SNAPSHOT } from '../persistence/device-store/boot-snapshot';
import { HUB_WEB_BOOT } from '../hub-web/hub-web.types';
import { currentPlatformBridge } from '../platform/platform-bridge.adapter';
import { EMPTY_USAGE_STORE, UsageLogEntry, recordUsage, sumUsageStores } from "@dude/domain/core/usage/usage.model";
import type { UsageStore } from "@dude/domain/core/usage/usage.model";
import { ActivityPeriod, lifetimeToolCounts, selectActivityPeriod } from "@dude/tool-engine/core/usage/activity-summary";

/** Desktop commits to the Device Store at most this often; `flush()` (quit/window close) commits any pending write at once. */
export const USAGE_COMMIT_DEBOUNCE_MS = 2000;

/**
 * Local usage tracking (DUDE_PRD.md §21 Phase 24 Items 5/6/14) — uniform across all 277 tools,
 * unlike History: only `{toolId, count, lastUsedAt}` is ever stored, never tool content, so there
 * is no sensitivity gradient and no per-tool opt-in. `'__usage__'` is a synthetic pseudo-tool-id,
 * the same trick `'__workspace__'`/`'__pipelines__'` already use, which gets this store
 * `PersistenceService.clearAll()` participation for free. See `AGENTS.md` in this directory.
 */
@Injectable({ providedIn: 'root' })
export class UsageService {
  /** One `usage` document (record id `DOCUMENT_ID`); the web build keeps its original `__usage__:activity` blob. */
  private readonly collection = inject(ENTITY_STORE).collection(usageCodec, {
    namespace: '__usage__',
    key: 'activity',
    toItems: (blob) => [blob],
    fromItems: (items) => items[0] ?? EMPTY_USAGE_STORE,
  });
  /**
   * Usage is per device (Phase 31D): this device writes only its own record, whose id is the device id on desktop and
   * 'default' on the web (no device store). Reads aggregate every device's record.
   */
  private readonly ownId: string = this.resolveOwnId();
  /** Opens recorded since the last commit (desktop debounce); reads see it at once. */
  private readonly pending = signal<UsageStore | null>(null);
  private readonly own = (): UsageStore =>
    this.pending() ?? this.collection.get(this.ownId) ?? (this.ownId === 'default' ? EMPTY_USAGE_STORE : { ...EMPTY_USAGE_STORE, deviceId: this.ownId });
  private readonly store = computed<UsageStore>(() => {
    const pending = this.pending();
    const stores = this.collection.items().filter((s) => (s.deviceId ?? 'default') !== this.ownId);
    return sumUsageStores([...stores, pending ?? this.collection.items().find((s) => (s.deviceId ?? 'default') === this.ownId) ?? EMPTY_USAGE_STORE]);
  });
  private readonly debounced = currentPlatformBridge()?.store !== undefined;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Desktop: the device id. Hub web with usage shared: this browser's Hub device row (the only usage the Hub accepts from it). */
  private resolveOwnId(): string {
    const hub = inject(HUB_WEB_BOOT);
    return inject(BOOT_SNAPSHOT).boot?.device?.deviceId ?? (hub?.access.usage ? hub.deviceId : 'default');
  }

  constructor() {
    const bridge = currentPlatformBridge()?.store;
    if (!bridge) return;
    // Opens are frequent and coalesce into one outbox op anyway, so desktop commits are debounced and flushed on quit / hide.
    const unsubscribe = bridge.onFlushRequest(() => this.flush());
    const onHide = (): void => void this.flush();
    if (typeof window !== 'undefined') window.addEventListener('pagehide', onHide);
    inject(DestroyRef).onDestroy(() => {
      unsubscribe();
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onHide);
      if (this.timer !== null) clearTimeout(this.timer);
    });
  }

  /** `now` is injectable so day-boundary behavior is testable without fake timers. */
  recordOpen(toolId: string, now: Date = new Date()): void {
    const next = recordUsage(this.own(), toolId, now.toISOString());
    if (!this.debounced) {
      void this.collection.upsert(next);
      return;
    }
    this.pending.set(next);
    this.timer ??= setTimeout(() => void this.flush(), USAGE_COMMIT_DEBOUNCE_MS);
  }

  /** Commits any pending write now (store flush request, window hide). Never rejects. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const next = this.pending();
    if (next === null) return;
    // The collection updates its own signal synchronously, so reads never see a gap.
    const committed = this.collection.upsert(next);
    this.pending.set(null);
    await committed.catch(() => undefined);
  }

  /** The trailing `days` local days with tracked/untracked distinction (Phase 30H.2). */
  activityPeriod(days: number, now: Date = new Date(), isKnownTool?: (toolId: string) => boolean): ActivityPeriod {
    const { dailyBuckets, trackingStartedOn } = this.store();
    return selectActivityPeriod(dailyBuckets, trackingStartedOn, { days, now, isKnownTool });
  }

  /** Lifetime opens per tool id. */
  lifetimeCounts(): Record<string, number> {
    return lifetimeToolCounts(this.store().counts);
  }

  /** Lifetime `{toolId, count, lastUsedAt}` for every tool ever opened. */
  lifetimeEntries(): readonly { readonly toolId: string; readonly count: number; readonly lastUsedAt: string }[] {
    return Object.entries(this.store().counts).map(([toolId, c]) => ({ toolId, count: c.count, lastUsedAt: c.lastUsedAt }));
  }

  lastUsedAt(toolId: string): string | undefined {
    return this.store().counts[toolId]?.lastUsedAt;
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
