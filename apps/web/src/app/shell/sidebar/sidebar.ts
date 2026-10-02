import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DesktopFeatureMarker } from '../../shared/components/desktop-feature-marker/desktop-feature-marker';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { CATEGORY_METADATA, ToolCategory, TOOL_CATEGORIES } from "@dude/shared-types/shared/models/tool-category.model";
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { computeCatalogCounts } from "@dude/tool-engine/core/registry/browse-tools-counts";
import { WorkspaceLayoutService } from '../../core/workspace/workspace-layout.service';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { UnifiedRecentsService } from '../../core/recents/unified-recents.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ToolLauncherService } from '../../core/registry/tool-launcher.service';
import { CommandPaletteService } from '../command-palette/command-palette.service';
import { CategoryIcon } from '../../shared/components/category-icon/category-icon';
import { OfflineAvailability } from '../../shared/components/offline-badge/offline-availability.directive';
import { ShortcutHint } from '../../shared/components/shortcut-hint/shortcut-hint';

const RECENTS_LIMIT = 5;
/** Max tool links an expanded category renders inline; the rest are one "All N" link into Browse Tools. */
export const SIDEBAR_CATEGORY_LIMIT = 15;

/**
 * Sidebar Information Architecture rewrite (DUDE_PRD.md §21 Phase 30B.1) — the tool list is now a
 * collapsed category index (counts, derived live from the registry) rather than an always-expanded
 * wall of ~277 links. A category row is both a link into Browse Tools' filtered view (`/tools`, the
 * ninth sanctioned shell exception — see `shell/AGENTS.md`) and independently caret-expandable
 * in place for users who want the old inline list without leaving the current page. Compact
 * Favorites/Recents sections above the index reuse `FavoritesService`/`UnifiedRecentsService`
 * exactly as Deck's rails already do — never a second hand-rolled list.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, CategoryIcon, OfflineAvailability, DesktopFeatureMarker, ShortcutHint],
  templateUrl: './sidebar.html',
})
export class Sidebar {
  private readonly registry = inject(ToolRegistryService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);
  private readonly router = inject(Router);
  protected readonly favorites = inject(FavoritesService);
  protected readonly recents = inject(UnifiedRecentsService);
  private readonly launcher = inject(ToolLauncherService);
  protected readonly paletteService = inject(CommandPaletteService);

  protected readonly categories = TOOL_CATEGORIES;
  protected readonly meta = CATEGORY_METADATA;
  protected readonly grouped = computed(() => this.registry.groupedByCategory());
  protected readonly openTabCount = computed(() => this.workspaceLayout.openTabs().length);

  protected readonly counts = computed(() =>
    computeCatalogCounts(this.registry.getAll(), {
      hasWebUnavailableFeature: (id) => this.registry.hasWebUnavailableFeature(id),
      isFavorite: (id) => this.favorites.isToolPinned(id),
    }),
  );

  /** Top 5 most-recently-active tool/workspace-tab entries -- capped, "See all" links to /history. */
  protected readonly recentTools = computed(() =>
    this.recents
      .entries()
      .filter((entry) => entry.kind === 'tool' || entry.kind === 'workspace-tab')
      .slice(0, RECENTS_LIMIT),
  );

  /** Pinned favorites, capped for the compact sidebar section -- "See all" links to Browse Tools. */
  protected readonly favoriteTools = computed(() => this.favorites.pinnedTools().slice(0, RECENTS_LIMIT));

  /**
   * Categories the user keeps open across sessions (Phase 30I.3 -- this reverses 30B's "session-only"
   * decision, but only for *keeping open*: the default for a category stays collapsed unless it is
   * the active route's category, so a Ctrl+K jump into a collapsed category still lands expanded).
   * Namespaced `'__sidebar__'` so "Clear all local data" removes it. Untrusted on read.
   */
  private readonly persistence = inject(PersistenceService);
  private readonly openCategories = this.persistence.signal<readonly string[]>('__sidebar__', 'openCategories', 'local', []);
  private readonly keptOpen = computed(() => {
    const stored: unknown = this.openCategories();
    return new Set(Array.isArray(stored) ? stored.filter((c): c is ToolCategory => TOOL_CATEGORIES.includes(c as ToolCategory)) : []);
  });

  /** Explicit expand/collapse choices made this session; they win over the persisted set and the
   *  active-route default (see `isExpanded`). */
  private readonly expandOverrides = signal<ReadonlyMap<ToolCategory, boolean>>(new Map());

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The active tool's category, so a deep link / back-forward / Ctrl+K jump into a collapsed
   *  category still lands with that category auto-expanded and its tool link visible/highlighted. */
  protected readonly activeCategory = computed<ToolCategory | undefined>(() => this.registry.getByRoute(this.currentUrl())?.category);

  protected readonly isExpanded = computed(() => {
    const active = this.activeCategory();
    const overrides = this.expandOverrides();
    const keptOpen = this.keptOpen();
    return (category: ToolCategory) => overrides.get(category) ?? (keptOpen.has(category) || category === active);
  });

  /** Per expanded category: the first `SIDEBAR_CATEGORY_LIMIT` tools (plus the active tool if beyond the cap) and how many are hidden. */
  protected readonly visibleTools = computed(() => {
    const grouped = this.grouped();
    const activeId = this.registry.getByRoute(this.currentUrl())?.id;
    return (category: ToolCategory): { readonly tools: readonly ToolDefinition[]; readonly hidden: number } => {
      const all = grouped[category] ?? [];
      const tools = all.slice(0, SIDEBAR_CATEGORY_LIMIT);
      const active = activeId ? all.find((tool) => tool.id === activeId) : undefined;
      if (active && !tools.includes(active)) tools.push(active);
      return { tools, hidden: all.length - tools.length };
    };
  });

  protected toggleCategory(category: ToolCategory, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const expand = !this.isExpanded()(category);
    const next = new Map(this.expandOverrides());
    next.set(category, expand);
    this.expandOverrides.set(next);

    const kept = new Set(this.keptOpen());
    if (expand) kept.add(category);
    else kept.delete(category);
    this.openCategories.set(TOOL_CATEGORIES.filter((c) => kept.has(c)));
  }

  /** Sidebar is visible on every route including `/workspace`, so tool opens go through
   *  `ToolLauncherService`'s workspace-aware branch, not a plain `routerLink`. */
  protected openTool(toolId: string): void {
    const tool = this.registry.getById(toolId);
    if (tool) this.launcher.open(tool);
  }
}
