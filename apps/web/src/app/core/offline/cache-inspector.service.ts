import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { RUNTIMES } from "@dude/contracts/core/platform/capability-catalog";
import { RUNTIME_IDS, RuntimeId } from "@dude/shared-types/shared/models/tool-capability.model";
import { OfflineReadinessService } from './offline-readiness.service';
import { filesForGroup } from "@dude/domain/core/offline/offline-map.model";

export interface StorageSummary {
  readonly usage: number | null;
  readonly quota: number | null;
  readonly persisted: boolean | null;
}

export interface AssetGroupSummary {
  readonly name: string;
  readonly label: string;
  readonly runtime: RuntimeId | null;
  readonly installMode: 'prefetch' | 'lazy';
  readonly totalFiles: number;
  readonly cachedFiles: number;
  readonly buildBytes: number;
  readonly cachedBytes: number;
}

/**
 * A preview of a destructive cache action (§5.2.1-style two-step contract). `plan*()` never
 * mutates anything. Only `execute(plan)` does, and only for a plan the UI showed and the user
 * explicitly confirmed. No action runs from page load, inspection, or opening Settings.
 */
export type CacheActionPlan =
  | { readonly kind: 'clear-runtime'; readonly runtime: RuntimeId; readonly label: string; readonly files: readonly string[]; readonly bytes: number }
  | { readonly kind: 'repair'; readonly cacheNames: readonly string[]; readonly registrations: number };

/** Swappable for tests. Repair must reload so the page re-registers a fresh service worker. */
export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => () => window.location.reload(),
});

/**
 * Cache Storage Budget / Inspector and Clear Cached Runtimes / Repair Installation (DUDE_PRD.md
 * §21 Phase 26 Items 4-5). Works only against the Angular service worker's own `ngsw:*` caches.
 * It never touches localStorage, sessionStorage, or IndexedDB, so tool inputs, preferences,
 * workspaces, pipelines, and History all survive both actions. "Clear all local data" in Data &
 * Privacy stays the one place for that.
 */
@Injectable({ providedIn: 'root' })
export class CacheInspectorService {
  private readonly readiness = inject(OfflineReadinessService);
  private readonly reload = inject(PAGE_RELOAD);

  private readonly storageSignal = signal<StorageSummary>({ usage: null, quota: null, persisted: null });
  readonly storage = this.storageSignal.asReadonly();

  readonly groups = computed<readonly AssetGroupSummary[]>(() => {
    const map = this.readiness.map();
    if (!map) return [];
    const cached = this.readiness.cached();
    const runtimeByGroup = new Map(RUNTIME_IDS.map((runtime) => [RUNTIMES[runtime].assetGroup, runtime]));
    const sizeByFile = new Map(map.files.map((file, index) => [file, map.sizes[index] ?? 0]));
    return Object.entries(map.groups).map(([name, group]) => {
      const files = filesForGroup(map, name);
      const cachedFiles = files.filter((file) => cached.has(file));
      const sum = (list: readonly string[]) => list.reduce((total, file) => total + (sizeByFile.get(file) ?? 0), 0);
      const runtime = runtimeByGroup.get(name) ?? null;
      return {
        name,
        label: runtime ? RUNTIMES[runtime].label : name,
        runtime,
        installMode: group.installMode,
        totalFiles: files.length,
        cachedFiles: cachedFiles.length,
        buildBytes: sum(files),
        cachedBytes: sum(cachedFiles),
      };
    });
  });

  async refresh(): Promise<void> {
    await this.readiness.refresh();
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    const [estimate, persisted] = await Promise.all([
      storage?.estimate?.().catch(() => undefined),
      storage?.persisted?.().catch(() => undefined),
    ]);
    this.storageSignal.set({ usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted: persisted ?? null });
  }

  /** Asks the browser not to evict DUDE's storage under pressure. The browser may still say no. */
  async requestPersistence(): Promise<boolean> {
    const granted = (await navigator.storage?.persist?.().catch(() => false)) ?? false;
    await this.refresh();
    return granted;
  }

  planClearRuntime(runtime: RuntimeId): CacheActionPlan {
    const map = this.readiness.map();
    const cached = this.readiness.cached();
    const files = map ? filesForGroup(map, RUNTIMES[runtime].assetGroup).filter((file) => cached.has(file)) : [];
    const sizeByFile = new Map(map?.files.map((file, index) => [file, map.sizes[index] ?? 0]) ?? []);
    return {
      kind: 'clear-runtime',
      runtime,
      label: RUNTIMES[runtime].label,
      files,
      bytes: files.reduce((total, file) => total + (sizeByFile.get(file) ?? 0), 0),
    };
  }

  async planRepair(): Promise<CacheActionPlan> {
    const cacheNames = (await caches.keys()).filter((name) => name.startsWith('ngsw:'));
    const registrations = (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0;
    return { kind: 'repair', cacheNames, registrations };
  }

  async execute(plan: CacheActionPlan): Promise<void> {
    if (plan.kind === 'clear-runtime') {
      const group = RUNTIMES[plan.runtime].assetGroup;
      const targets = new Set(plan.files.map((file) => new URL(file, document.baseURI).href));
      for (const name of await caches.keys()) {
        if (!name.startsWith('ngsw:') || !name.endsWith(`:assets:${group}:cache`)) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (targets.has(request.url)) await cache.delete(request);
        }
      }
      await this.refresh();
      return;
    }
    for (const registration of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await registration.unregister();
    for (const name of plan.cacheNames) await caches.delete(name);
    this.reload();
  }
}
