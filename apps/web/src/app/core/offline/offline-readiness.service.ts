import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { ConnectivityService } from '../connectivity/connectivity.service';
import { PlatformService } from '../platform/platform.service';
import { RUNTIMES } from "@dude/contracts/core/platform/capability-catalog";
import { ToolRegistryService } from '../registry/tool-registry.service';
import { RuntimeId } from "@dude/shared-types/shared/models/tool-capability.model";
import { ToolCategory } from "@dude/shared-types/shared/models/tool-category.model";
import { CachePlan, OfflineMap, buildCachePlan, filesForGroup, filesForShell, filesForTool, isOfflineMap, toRelativePath } from "@dude/domain/core/offline/offline-map.model";

export type ToolReadiness = 'ready' | 'missing' | 'unknown';

export interface CacheProgress {
  readonly done: number;
  readonly total: number;
  readonly failed: number;
}

const FETCH_CONCURRENCY = 4;

/**
 * Offline readiness for the web companion (DUDE_PRD.md §21 Phase 26 Item 10). It answers "will
 * this tool open without a network?" by checking the build-time `offline-map.json` against what
 * the Angular service worker has actually cached. It can also pre-cache a tool, a category, or
 * everything ("Make available offline").
 *
 * Pre-caching is just `fetch()`: under a controlling service worker, ngsw's lazy asset groups
 * store any hashed file they serve, so no custom service worker is needed. On desktop (no service
 * worker, runtimes shipped locally) and in dev builds the service is inert, and everything reports
 * `'unknown'`, which callers treat as available.
 */
@Injectable({ providedIn: 'root' })
export class OfflineReadinessService {
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly platform = inject(PlatformService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly registry = inject(ToolRegistryService);

  readonly enabled = !this.platform.isDesktop() && (this.swUpdate?.isEnabled ?? false) && typeof caches !== 'undefined';

  private readonly mapSignal = signal<OfflineMap | null>(null);
  private readonly cachedSignal = signal<ReadonlySet<string>>(new Set());
  private readonly progressSignal = signal<CacheProgress | null>(null);
  private loading: Promise<void> | null = null;
  private abort: AbortController | null = null;

  readonly map = this.mapSignal.asReadonly();
  readonly cached = this.cachedSignal.asReadonly();
  /** Non-null while a "Make available offline" run is in flight. */
  readonly progress = this.progressSignal.asReadonly();
  readonly ready = computed(() => this.mapSignal() !== null);

  constructor() {
    // Offline is when readiness matters most (dimming uncached tools), and the map is in the
    // prefetched shell, so it loads from cache with no network. Online, it loads on first use.
    effect(() => {
      if (this.enabled && !this.connectivity.online()) void this.refresh();
    });
  }

  /** Loads the map on first call and re-scans Cache Storage on every call. Safe to call repeatedly. */
  refresh(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.loading ??= this.loadMap();
    return this.loading.then(() => this.scanCaches());
  }

  /** Computed once per cache scan, since sidebar, deck, and search ask about every tool. */
  private readonly missingTools = computed(() => {
    const map = this.mapSignal();
    const cached = this.cachedSignal();
    if (!map) return null;
    return new Set(this.registry.getAll().filter((tool) => tool.id in map.tools && !this.filesFor(tool.id, map).every((file) => cached.has(file))).map((tool) => tool.id));
  });

  readinessOf(toolId: string): ToolReadiness {
    const map = this.mapSignal();
    const missing = this.missingTools();
    if (!map || !missing || !(toolId in map.tools)) return 'unknown';
    return missing.has(toolId) ? 'missing' : 'ready';
  }

  /** True only when offline and the tool is known not to be cached: the "dim it" condition. */
  unavailableOffline(toolId: string): boolean {
    return this.enabled && !this.connectivity.online() && this.readinessOf(toolId) === 'missing';
  }

  planTool(toolId: string): CachePlan | null {
    return this.planTools([toolId]);
  }

  planCategory(category: ToolCategory): CachePlan | null {
    return this.planTools(this.registry.getByCategory(category).map((tool) => tool.id));
  }

  /** Every tool, every optional runtime, and every lazy shell page: the full offline footprint. */
  planAll(): CachePlan | null {
    const map = this.mapSignal();
    if (!map) return null;
    const files = [...filesForShell(map), ...this.registry.getAll().flatMap((tool) => this.filesFor(tool.id, map, 'all'))];
    return buildCachePlan(map, files, this.cachedSignal());
  }

  planRuntime(runtime: RuntimeId): CachePlan | null {
    const map = this.mapSignal();
    return map ? buildCachePlan(map, filesForGroup(map, RUNTIMES[runtime].assetGroup), this.cachedSignal()) : null;
  }

  /**
   * Fetches every missing file in `plan` so the service worker caches it. Resolves to the number
   * of files that failed (offline, or evicted between plan and run). Cancel with `cancel()`.
   */
  async cache(plan: CachePlan): Promise<number> {
    if (!this.enabled || this.abort) return 0;
    if (!navigator.serviceWorker?.controller) throw new Error('The service worker is not controlling this page yet. Reload once, then try again.');
    const abort = (this.abort = new AbortController());
    const queue = [...plan.missingFiles];
    let done = 0;
    let failed = 0;
    this.progressSignal.set({ done, total: queue.length, failed });
    const worker = async () => {
      for (let file = queue.shift(); file !== undefined && !abort.signal.aborted; file = queue.shift()) {
        try {
          const response = await fetch(new URL(file, document.baseURI), { signal: abort.signal });
          if (!response.ok) failed++;
          await response.blob();
        } catch {
          if (!abort.signal.aborted) failed++;
        }
        done++;
        this.progressSignal.set({ done, total: plan.missingFiles.length, failed });
      }
    };
    try {
      await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
    } finally {
      this.abort = null;
      this.progressSignal.set(null);
      await this.scanCaches();
    }
    return failed;
  }

  cancel(): void {
    this.abort?.abort();
  }

  private planTools(ids: readonly string[]): CachePlan | null {
    const map = this.mapSignal();
    return map ? buildCachePlan(map, ids.flatMap((id) => this.filesFor(id, map, 'all')), this.cachedSignal()) : null;
  }

  /** `'open'` backs readiness ("opens offline"); `'all'` backs downloads (fully usable offline). */
  private filesFor(toolId: string, map: OfflineMap, scope: 'open' | 'all' = 'open'): string[] {
    return filesForTool(map, toolId, this.registry.runtimesOf(toolId).map((runtime) => RUNTIMES[runtime].assetGroup), scope);
  }

  private async loadMap(): Promise<void> {
    try {
      const response = await fetch(new URL('offline-map.json', document.baseURI));
      const body: unknown = response.ok ? await response.json() : null;
      if (isOfflineMap(body)) this.mapSignal.set(body);
    } catch {
      // No map (e.g. a build without the postbuild step): readiness stays 'unknown' everywhere.
    }
  }

  private async scanCaches(): Promise<void> {
    const basePath = new URL(document.baseURI).pathname;
    const found = new Set<string>();
    try {
      for (const name of await caches.keys()) {
        if (!name.startsWith('ngsw:') || !name.includes(':assets:')) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const file = toRelativePath(request.url, basePath);
          if (file !== undefined) found.add(file);
        }
      }
    } catch {
      return;
    }
    this.cachedSignal.set(found);
  }
}
