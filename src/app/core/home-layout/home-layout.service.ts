import { Injectable, computed, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { PanelRegistryService } from '../registry/panel-registry.service';
import { LayoutIssue, validateLayout } from './grid-engine';
import type { HomeLayout, PanelInstance } from './home-layout.model';
import { limitsFromDefinitions } from './default-layout';
import {
  EMPTY_HOME_LAYOUT_STORE,
  HomeLayoutData,
  HomeLayoutMergeMode,
  KindCatalog,
  contentAfterReset,
  effectiveLayout,
  mergeHomeLayout,
  migrateHomeLayoutStore,
  sanitizeHomeLayoutData,
} from './home-layout-store.model';
import type { UserContent } from './user-content.model';

/** A layout being edited (Settings › Home layout). Saved atomically via `save`. */
export interface HomeLayoutDraft {
  readonly instances: readonly PanelInstance[];
  readonly wide: HomeLayout['wide'];
  readonly narrow: HomeLayout['narrow'];
  readonly narrowCustomized: boolean;
  readonly content: HomeLayoutData['content'];
}

export type SaveLayoutResult = { readonly ok: true } | { readonly ok: false; readonly issues: readonly LayoutIssue[] };

/**
 * Versioned Home layout store (DUDE_PRD.md Phase 30I). `'__home-layout__'` is a synthetic
 * pseudo-tool-id, so `PersistenceService.clearAll()` wipes it. Presentation state only — see
 * `AGENTS.md` in this directory. Untouched installs store nothing and render the registry's
 * manifest-generated default; only an explicit Save writes a layout.
 */
@Injectable({ providedIn: 'root' })
export class HomeLayoutService {
  private readonly persistence = inject(PersistenceService);
  private readonly registry = inject(PanelRegistryService);
  private readonly store = this.persistence.signal('__home-layout__', 'layout', 'local', EMPTY_HOME_LAYOUT_STORE, { crossTab: 'live' });

  private readonly catalog: KindCatalog = { resolve: (id) => this.registry.resolveKind(id) };

  constructor() {
    const migrated = migrateHomeLayoutStore(this.store(), this.catalog, this.registry.defaultLayout());
    if (JSON.stringify(migrated) !== JSON.stringify(this.store())) this.store.set(migrated);
  }

  /** The layout Home renders right now, for both widths. */
  readonly layout = computed<HomeLayout>(() => effectiveLayout(this.store(), this.registry.defaultLayout(), this.catalog));
  readonly customized = computed(() => this.store().customized);
  readonly narrowCustomized = computed(() => this.store().narrowCustomized);
  readonly content = computed(() => this.store().content);

  /** Exportable slice (backup bundle). */
  readonly data = computed<HomeLayoutData>(() => {
    const s = this.store();
    return { customized: s.customized, narrowCustomized: s.narrowCustomized, instances: s.instances, wide: s.wide, narrow: s.narrow, content: s.content };
  });

  contentOf(instanceId: string): UserContent | undefined {
    return this.store().content[instanceId];
  }

  /** Save one panel's user-authored content in place (in-panel edits, legacy migration). */
  setContent(instanceId: string, content: UserContent): void {
    const inLayout = this.layout().instances.some((i) => i.id === instanceId);
    if (!inLayout) return;
    this.write({ ...this.data(), content: { ...this.store().content, [instanceId]: content } });
  }

  /** Validate then persist an edited layout. Overlaps/out-of-range placements are rejected, not moved. */
  save(draft: HomeLayoutDraft): SaveLayoutResult {
    const limitsOf = limitsFromDefinitions(this.registry.getAll(), draft.instances);
    const issues = [...validateLayout(draft.wide, limitsOf), ...validateLayout(draft.narrow, limitsOf)];
    if (issues.length > 0) return { ok: false, issues };
    this.write({ customized: true, ...draft });
    return { ok: true };
  }

  /**
   * Back to the shipped default. Only layout state changes: favorites, usage, projects,
   * workspaces and pipelines are separate stores and are never touched. Content of user-authored
   * panels that aren't part of the default is removed.
   */
  resetToDefault(): void {
    const defaults = this.registry.defaultLayout();
    this.write({
      customized: false,
      narrowCustomized: false,
      instances: [],
      wide: [],
      narrow: [],
      content: contentAfterReset(this.store().content, defaults),
    });
  }

  /** Backup import: re-sanitized and merged per the chosen conflict mode. */
  importData(incoming: unknown, mode: HomeLayoutMergeMode): void {
    const defaults = this.registry.defaultLayout();
    const clean = sanitizeHomeLayoutData(incoming, this.catalog, defaults);
    this.write(mergeHomeLayout(this.data(), clean, mode, defaults, this.catalog));
  }

  private write(data: HomeLayoutData): void {
    const defaults = this.registry.defaultLayout();
    this.store.set({ schemaVersion: 1, ...sanitizeHomeLayoutData(data, this.catalog, defaults) });
  }
}
