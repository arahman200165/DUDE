import { Injectable, computed, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { PanelRegistryService } from '../registry/panel-registry.service';
import { LayoutIssue, firstFit, validateLayout } from './grid-engine';
import { defaultConfig } from './panel-config';
import type { HomeLayout, HomeLayoutDraft, PanelInstance } from './home-layout.model';
export type { HomeLayoutDraft } from './home-layout.model';
import { limitsFromDefinitions } from './default-layout';
import {
  EMPTY_HOME_LAYOUT_STORE,
  HomeLayoutData,
  HomeLayoutMergeMode,
  KindCatalog,
  MAX_INSTANCES,
  contentAfterReset,
  effectiveLayout,
  mergeHomeLayout,
  migrateHomeLayoutStore,
  newInstanceId,
  sanitizeHomeLayoutData,
} from './home-layout-store.model';
import type { UserContent } from './user-content.model';

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

  /** Instances of a kind in the current (effective) layout. */
  instancesOfKind(kindId: string): readonly PanelInstance[] {
    return this.layout().instances.filter((i) => i.kindId === kindId);
  }

  /**
   * Add a panel of `kindId` at the bottom of both layouts (used by the legacy-notes migration and
   * the editor). Returns the new instance id, or null when the kind is unknown, single-instance and
   * already present, or the layout is full. This customizes the layout.
   */
  appendInstance(kindId: string, content?: UserContent): string | null {
    const def = this.registry.getById(kindId);
    const current = this.layout();
    if (!def || current.instances.length >= MAX_INSTANCES) return null;
    if (!def.multiInstance && current.instances.some((i) => i.kindId === kindId)) return null;
    const taken = new Set(current.instances.map((i) => i.id));
    const id = !taken.has(kindId) ? kindId : newInstanceId(kindId);
    const maxW = Math.min(def.size.maxW ?? 12, 12);
    const w = Math.min(Math.max(def.size.minW, def.defaultPlacement?.w ?? 6), maxW);
    const h = Math.max(def.size.minH, def.defaultPlacement?.h ?? 2);
    const saved = this.save({
      instances: [...current.instances, { id, kindId, config: defaultConfig(def.config), visible: true }],
      wide: [...current.wide, { id, ...firstFit(current.wide, { w, h }) }],
      narrow: [...current.narrow, { id, ...firstFit(current.narrow, { w: maxW, h }) }],
      narrowCustomized: this.narrowCustomized(),
      content: content ? { ...this.content(), [id]: content } : this.content(),
    });
    return saved.ok ? id : null;
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
