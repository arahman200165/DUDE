import { Component, computed, inject, signal } from '@angular/core';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { UsageService } from '../../core/usage/usage.service';
import { CATEGORY_METADATA, ToolCategory, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { ToolTable } from '../../shared/components/tool-table/tool-table';
import { ToolGrid } from '../../shared/components/tool-grid/tool-grid';
import { BrowseQueryHelp } from '../../shared/components/browse-query-help/browse-query-help';
import { parseBrowseQuery, ParsedBrowseQuery } from '../../core/registry/browse-tools-query';
import { filterTools } from '../../core/registry/browse-tools-filter';

/** Synthetic pseudo-tool-id namespace, the same trick `'__favorites__'`/`'__usage__'` use. */
const BROWSE_TOOLS_NAMESPACE = '__browse_tools__';
/** How far back "Recently Used" reaches for the `recent:true` operator/toggle — matches Deck's rails. */
const RECENT_LIMIT = 20;

export type BrowseToolsViewMode = 'table' | 'grid';
type StatusFacet = 'all' | 'experimental' | 'stable' | 'verified' | 'unstated';

/**
 * Browse Tools (`/tools`) — the dedicated, exhaustive tool catalog (DUDE_PRD.md §21 Phase 30A.1),
 * the ninth sanctioned shell exception (see `shell/AGENTS.md`). Deck's own "Browse all tools" grid
 * is left untouched here (Phase 30D's job) — this route becomes the authoritative complete-registry
 * surface search/filter/sort grow into across the rest of Phase 30A's milestones.
 *
 * Filtering itself (query parsing, criteria matching) is the pure `core/registry/browse-tools-*`
 * logic (30A.3) — this component only resolves the live signals (favorites, usage, platform
 * capabilities) those pure functions need and merges the UI's explicit facet controls with the typed
 * query operators, UI facet always taking precedence over a same-purpose operator in the text.
 */
@Component({
  selector: 'app-browse-tools',
  imports: [ToolTable, ToolGrid, BrowseQueryHelp],
  templateUrl: './browse-tools.html',
})
export class BrowseTools {
  private readonly registry = inject(ToolRegistryService);
  private readonly persistence = inject(PersistenceService);
  private readonly favorites = inject(FavoritesService);
  private readonly usage = inject(UsageService);

  protected readonly meta = CATEGORY_METADATA;
  protected readonly categories = TOOL_CATEGORIES;

  protected readonly viewMode = this.persistence.signal<BrowseToolsViewMode>(BROWSE_TOOLS_NAMESPACE, 'viewMode', 'local', 'table');

  protected readonly query = signal('');
  protected readonly categoryFacet = signal<ToolCategory | 'all'>('all');
  protected readonly platformFacet = signal<'all' | 'browser' | 'desktop'>('all');
  protected readonly statusFacet = signal<StatusFacet>('all');
  protected readonly favoritesOnly = signal(false);
  protected readonly recentOnly = signal(false);

  protected readonly platformFacets = [
    { id: 'all', label: 'All' },
    { id: 'browser', label: 'Works fully in browser' },
    { id: 'desktop', label: 'Desktop-enhanced' },
  ] as const;
  protected readonly statusFacets: readonly StatusFacet[] = ['all', 'verified', 'stable', 'experimental', 'unstated'];

  protected readonly total = computed(() => this.registry.getAll().length);

  private readonly recentToolIds = computed(() => new Set(this.usage.mostRecent(RECENT_LIMIT)));

  private readonly criteria = computed<ParsedBrowseQuery>(() => {
    const parsed = parseBrowseQuery(this.query());
    const category = this.categoryFacet();
    const platform = this.platformFacet();
    const status = this.statusFacet();
    return {
      ...parsed,
      category: category !== 'all' ? category : parsed.category,
      platform: platform !== 'all' ? platform : parsed.platform,
      status: status !== 'all' ? status : parsed.status,
      favorite: this.favoritesOnly() ? true : parsed.favorite,
      recent: this.recentOnly() ? true : parsed.recent,
    };
  });

  protected readonly filtered = computed<readonly ToolDefinition[]>(() =>
    filterTools(this.registry.getAll(), this.criteria(), {
      isFavorite: (id) => this.favorites.isToolPinned(id),
      isRecentlyUsed: (id) => this.recentToolIds().has(id),
      platformCapabilitiesOf: (id) => this.registry.platformCapabilitiesOf(id),
    }),
  );

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onCategoryChange(event: Event): void {
    this.categoryFacet.set((event.target as HTMLSelectElement).value as ToolCategory | 'all');
  }

  protected onStatusChange(event: Event): void {
    this.statusFacet.set((event.target as HTMLSelectElement).value as StatusFacet);
  }
}
