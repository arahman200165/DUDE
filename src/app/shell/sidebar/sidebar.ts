import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DesktopFeatureMarker } from '../../shared/components/desktop-feature-marker/desktop-feature-marker';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { CATEGORY_METADATA, ToolCategory, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { computeCatalogCounts } from '../../core/registry/browse-tools-counts';
import { WorkspaceLayoutService } from '../../core/workspace/workspace-layout.service';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { CommandPaletteService } from '../command-palette/command-palette.service';
import { CategoryIcon } from '../../shared/components/category-icon/category-icon';
import { OfflineAvailability } from '../../shared/components/offline-badge/offline-availability.directive';
import { ShortcutHint } from '../../shared/components/shortcut-hint/shortcut-hint';

/**
 * Sidebar Information Architecture rewrite (DUDE_PRD.md §21 Phase 30B.1) — the tool list is now a
 * collapsed category index (counts, derived live from the registry) rather than an always-expanded
 * wall of ~277 links. A category row is both a link into Browse Tools' filtered view (`/tools`, the
 * ninth sanctioned shell exception — see `shell/AGENTS.md`) and independently caret-expandable
 * in place for users who want the old inline list without leaving the current page.
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
  private readonly favorites = inject(FavoritesService);
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

  /** Explicit user expand/collapse overrides, session-only (no persistence, per the locked 30B
   *  decision) -- absent from this map, a category falls back to "expanded iff it's the active
   *  route's category" (see `isExpanded`). */
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
    return (category: ToolCategory) => overrides.get(category) ?? category === active;
  });

  protected toggleCategory(category: ToolCategory, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const next = new Map(this.expandOverrides());
    next.set(category, !this.isExpanded()(category));
    this.expandOverrides.set(next);
  }
}
