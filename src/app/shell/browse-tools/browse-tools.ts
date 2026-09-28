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
import { BrowseToolsSortMode, sortTools } from '../../core/registry/browse-tools-sort';
import { scoreForRecommendation } from '../../core/registry/browse-tools-recommend';
import { computeCatalogCounts } from '../../core/registry/browse-tools-counts';

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

  protected readonly sortMode = signal<BrowseToolsSortMode>('recommended');
  protected readonly sortModes: readonly { readonly id: BrowseToolsSortMode; readonly label: string }[] = [
    { id: 'recommended', label: 'Recommended' },
    { id: 'recent', label: 'Recently Used' },
    { id: 'most-used', label: 'Most Used' },
    { id: 'favorites-first', label: 'Favorites First' },
    { id: 'alpha', label: 'A–Z' },
    { id: 'category', label: 'Category' },
  ];

  protected readonly counts = computed(() =>
    computeCatalogCounts(this.registry.getAll(), {
      hasWebUnavailableFeature: (id) => this.registry.hasWebUnavailableFeature(id),
      isFavorite: (id) => this.favorites.isToolPinned(id),
    }),
  );

  /** Every ever-opened tool id, most-recent-first — an unbounded reach so `recent:*`/sort/recommend see the whole history, not just a capped rail. */
  private readonly recentRankById = computed(() => {
    const ranked = new Map<string, number>();
    this.usage.mostRecent(Number.MAX_SAFE_INTEGER).forEach((id, index) => ranked.set(id, index));
    return ranked;
  });

  private readonly recentToolIds = computed(() => new Set(this.usage.mostRecent(RECENT_LIMIT)));

  private recentRank(id: string): number {
    return this.recentRankById().get(id) ?? Infinity;
  }

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

  protected readonly sorted = computed<readonly ToolDefinition[]>(() => {
    const category = this.categoryFacet();
    const ioType = this.criteria().accepts ?? this.criteria().produces;
    return sortTools(this.filtered(), this.sortMode(), {
      isFavorite: (id) => this.favorites.isToolPinned(id),
      frequencyOf: (id) => this.usage.frequencyOf(id),
      recentRank: (id) => this.recentRank(id),
      recommendationScore: (tool) =>
        scoreForRecommendation({
          isFavorite: this.favorites.isToolPinned(tool.id),
          frequency: this.usage.frequencyOf(tool.id),
          recentRank: this.recentRank(tool.id),
          matchesActiveCategory: category !== 'all' && tool.category === category,
          ioCompatible: ioType !== undefined && (tool.io.accepts.includes(ioType) || tool.io.produces.includes(ioType)),
        }),
    });
  });

  protected onSortChange(event: Event): void {
    this.sortMode.set((event.target as HTMLSelectElement).value as BrowseToolsSortMode);
  }

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
