import { Component, computed, inject, signal } from '@angular/core';
import { PlatformService } from '../../../core/platform/platform.service';
import { PLATFORM_CAPABILITIES, RUNTIMES, platformCapabilities, runtimeCapabilities } from '../../../core/platform/capability-catalog';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { OfflineReadinessService } from '../../../core/offline/offline-readiness.service';
import { CacheActionPlan, CacheInspectorService } from '../../../core/offline/cache-inspector.service';
import { CachePlan, formatBytes } from '../../../core/offline/offline-map.model';
import { CATEGORY_METADATA, TOOL_CATEGORIES, ToolCategory } from '../../../shared/models/tool-category.model';
import { RuntimeId } from '../../../shared/models/tool-capability.model';

interface PendingDownload {
  readonly label: string;
  readonly plan: CachePlan;
}

/**
 * Settings › Web & Offline (DUDE_PRD.md §21 Phase 26 Items 4, 5, 6, 10). On the web it holds the
 * Cache Storage inspector, per-runtime cache/clear, "Make available offline", and Repair
 * installation. On both platforms it shows the Web Capability Matrix.
 *
 * Every destructive action is two-step: the first click only builds and shows a plan (what goes,
 * how big), and a separate Confirm runs it. Downloads preview their size the same way before
 * fetching anything.
 */
@Component({
  selector: 'app-web-companion-settings',
  templateUrl: './web-companion-settings.html',
})
export class WebCompanionSettings {
  protected readonly platform = inject(PlatformService);
  protected readonly readiness = inject(OfflineReadinessService);
  protected readonly inspector = inject(CacheInspectorService);
  private readonly registry = inject(ToolRegistryService);

  protected readonly formatBytes = formatBytes;
  protected readonly categories = TOOL_CATEGORIES.map((id) => ({ id, label: CATEGORY_METADATA[id].label }));
  protected readonly selectedCategory = signal<ToolCategory>(TOOL_CATEGORIES[0]);

  protected readonly pendingAction = signal<CacheActionPlan | null>(null);
  protected readonly pendingDownload = signal<PendingDownload | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly runtimes = computed(() => this.inspector.groups().filter((group) => group.runtime !== null));
  protected readonly otherGroups = computed(() => this.inspector.groups().filter((group) => group.runtime === null));

  protected readonly matrix = computed(() =>
    this.registry
      .getAll()
      .flatMap((tool) => [
        ...platformCapabilities(tool.capabilities).map((capability) => ({
          tool,
          capability: PLATFORM_CAPABILITIES[capability.id].label,
          web: capability.web === 'fallback' ? 'Works, weaker browser fallback' : 'Desktop-only feature',
          unavailable: capability.web === 'unavailable',
          note: capability.note,
        })),
        ...runtimeCapabilities(tool.capabilities).map((runtime) => ({
          tool,
          capability: RUNTIMES[runtime].label,
          web: 'Cached on first use',
          unavailable: false,
          note: 'Optional runtime, downloaded on demand',
        })),
      ])
      .sort((a, b) => a.tool.title.localeCompare(b.tool.title)),
  );

  constructor() {
    if (this.readiness.enabled) void this.inspector.refresh();
  }

  protected async requestPersistence(): Promise<void> {
    const granted = await this.inspector.requestPersistence();
    this.message.set(granted ? 'The browser will keep DUDE’s storage unless you clear it.' : 'The browser declined. It may still evict cached data under storage pressure.');
  }

  // --- Downloads (non-destructive, but sized before they start) ---

  protected previewRuntime(runtime: RuntimeId): void {
    this.previewDownload(RUNTIMES[runtime].label, this.readiness.planRuntime(runtime));
  }

  protected previewCategory(): void {
    const category = this.selectedCategory();
    this.previewDownload(`${CATEGORY_METADATA[category].label} tools`, this.readiness.planCategory(category));
  }

  protected previewAll(): void {
    this.previewDownload('every tool and runtime', this.readiness.planAll());
  }

  protected async confirmDownload(): Promise<void> {
    const pending = this.pendingDownload();
    if (!pending) return;
    this.pendingDownload.set(null);
    this.message.set(null);
    try {
      const failed = await this.readiness.cache(pending.plan);
      this.message.set(failed ? `${failed} file(s) couldn’t be downloaded. Check your connection and try again.` : `${pending.label} now available offline.`);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected onCategoryChange(event: Event): void {
    this.selectedCategory.set((event.target as HTMLSelectElement).value as ToolCategory);
  }

  // --- Destructive actions (preview → confirm) ---

  protected previewClear(runtime: RuntimeId): void {
    this.pendingDownload.set(null);
    this.pendingAction.set(this.inspector.planClearRuntime(runtime));
  }

  protected async previewRepair(): Promise<void> {
    this.pendingDownload.set(null);
    this.pendingAction.set(await this.inspector.planRepair());
  }

  protected cancelPending(): void {
    this.pendingAction.set(null);
    this.pendingDownload.set(null);
  }

  protected async confirmAction(): Promise<void> {
    const plan = this.pendingAction();
    if (!plan) return;
    this.busy.set(true);
    try {
      await this.inspector.execute(plan);
      this.message.set(plan.kind === 'clear-runtime' ? `${plan.label} cleared. It downloads again the next time a tool needs it.` : null);
    } finally {
      this.pendingAction.set(null);
      this.busy.set(false);
    }
  }

  private previewDownload(label: string, plan: CachePlan | null): void {
    this.pendingAction.set(null);
    if (!plan) {
      this.message.set('Offline data isn’t loaded yet. Try again in a moment.');
      return;
    }
    if (plan.missingFiles.length === 0) {
      this.message.set(`Already available offline: ${label}.`);
      return;
    }
    this.pendingDownload.set({ label, plan });
  }
}
