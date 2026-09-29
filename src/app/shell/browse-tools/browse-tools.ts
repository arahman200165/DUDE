import { Component, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { UsageService } from '../../core/usage/usage.service';
import { CATEGORY_METADATA, ToolCategory, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { DataTable, DataTableColumn } from '../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../shared/components/data-table/data-table-cell.directive';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { ToolGrid } from '../../shared/components/tool-grid/tool-grid';
import { CategoryIcon } from '../../shared/components/category-icon/category-icon';
import { OfflineAvailability } from '../../shared/components/offline-badge/offline-availability.directive';
import { DesktopCapabilityBadge } from '../../shared/components/desktop-capability-badge/desktop-capability-badge';
import { BrowseQueryHelp } from '../../shared/components/browse-query-help/browse-query-help';
import { ShortcutHint } from '../../shared/components/shortcut-hint/shortcut-hint';
import { Disclosure } from '../../shared/components/disclosure/disclosure';
import { toolCapabilitySummary, toolStatusClass, toolStatusGlyph, toolStatusLabel } from '../../shared/utils/tool-status';
import { CommandPaletteService } from '../command-palette/command-palette.service';
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

const PLATFORM_VALUES: readonly ('browser' | 'desktop')[] = ['browser', 'desktop'];
const STATUS_FACET_VALUES: readonly StatusFacet[] = ['experimental', 'stable', 'verified', 'unstated'];
const SORT_MODE_VALUES: readonly BrowseToolsSortMode[] = ['recommended', 'recent', 'most-used', 'favorites-first', 'alpha', 'category'];
const VIEW_MODE_VALUES: readonly BrowseToolsViewMode[] = ['table', 'grid'];

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
 *
 * Active search/filters/sort/view-mode sync to the URL query string (30A.1/30A.8), so a filtered view
 * is bookmarkable/shareable; the URL wins on load, falling back to the locally persisted view mode
 * (and framework defaults for everything else) for a bare `/tools` hit.
 */
@Component({
  selector: 'app-browse-tools',
  imports: [
    DataTable,
    DataTableCellDef,
    ToolGrid,
    BrowseQueryHelp,
    ShortcutHint,
    RouterLink,
    CategoryIcon,
    OfflineAvailability,
    DesktopCapabilityBadge,
    Disclosure,
    StatusGlyph,
  ],
  templateUrl: './browse-tools.html',
})
export class BrowseTools {
  private readonly registry = inject(ToolRegistryService);
  private readonly persistence = inject(PersistenceService);
  private readonly favorites = inject(FavoritesService);
  private readonly usage = inject(UsageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly paletteService = inject(CommandPaletteService);

  @ViewChild('searchInput') private readonly searchInputRef?: ElementRef<HTMLInputElement>;

  protected readonly meta = CATEGORY_METADATA;
  protected readonly categories = TOOL_CATEGORIES;

  protected readonly viewMode = this.persistence.signal<BrowseToolsViewMode>(BROWSE_TOOLS_NAMESPACE, 'viewMode', 'local', 'table');

  protected readonly query = signal('');
  protected readonly categoryFacet = signal<ToolCategory | 'all'>('all');
  protected readonly platformFacet = signal<'all' | 'browser' | 'desktop'>('all');
  protected readonly statusFacet = signal<StatusFacet>('all');
  protected readonly favoritesOnly = signal(false);
  protected readonly recentOnly = signal(false);
  /** Persisted preference (Phase 30I.3); an explicit `?sort=` in the URL still overrides it. */
  protected readonly sortMode = this.persistence.signal<BrowseToolsSortMode>(BROWSE_TOOLS_NAMESPACE, 'sortMode', 'local', 'recommended');
  /** Filters tucked inside the collapsed "Filters" disclosure that are currently non-default (30J.4). */
  protected readonly advancedFilterCount = computed(
    () => (this.categoryFacet() !== 'all' ? 1 : 0) + (this.statusFacet() !== 'all' ? 1 : 0) + (this.sortMode() !== 'recommended' ? 1 : 0),
  );
  protected readonly selectedIndex = signal(0);

  protected readonly platformFacets = [
    { id: 'all', label: 'All' },
    { id: 'browser', label: 'Works fully in browser' },
    { id: 'desktop', label: 'Desktop-enhanced' },
  ] as const;
  protected readonly statusFacets: readonly StatusFacet[] = ['all', 'verified', 'stable', 'experimental', 'unstated'];
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

  /** Clamped against the live result count so a stale index from a since-narrowed filter never points past the end. */
  protected readonly selectedToolId = computed<string | undefined>(() => {
    const tools = this.sorted();
    if (!tools.length) return undefined;
    return tools[Math.min(this.selectedIndex(), tools.length - 1)]?.id;
  });

  /** Same clamping as `selectedToolId`, but as an index — `app-data-table`'s external-selection input. */
  protected readonly clampedSelectedIndex = computed(() => {
    const count = this.sorted().length;
    return count ? Math.min(this.selectedIndex(), count - 1) : 0;
  });

  protected readonly toolTableColumns: readonly DataTableColumn<ToolDefinition>[] = [
    { key: 'favorite', header: '', value: () => '', width: '28px' },
    { key: 'tool', header: 'Tool', value: (tool) => tool.title, width: '1fr' },
    { key: 'category', header: 'Category', value: (tool) => this.meta[tool.category].label, width: '110px' },
    { key: 'platform', header: 'Platform', value: () => '', width: '150px' },
    { key: 'status', header: 'Status', value: (tool) => toolStatusLabel(tool.status), width: '90px' },
    { key: 'capabilities', header: 'Capabilities', value: (tool) => toolCapabilitySummary(tool), width: '1fr', truncate: true },
  ];

  protected readonly statusLabel = toolStatusLabel;
  protected readonly statusClass = toolStatusClass;
  protected readonly statusGlyph = toolStatusGlyph;

  protected trackToolId(_index: number, tool: ToolDefinition): string {
    return tool.id;
  }

  /** `tool` inside an `appDataTableCell` template comes through as `any`; this narrows the index. */
  protected categoryMeta(tool: ToolDefinition) {
    return this.meta[tool.category];
  }

  protected isFavorite(id: string): boolean {
    return this.favorites.isToolPinned(id);
  }

  protected toggleFavorite(id: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.favorites.toggleTool(id);
  }

  protected onRowOpened(tool: ToolDefinition): void {
    void this.router.navigateByUrl(tool.route);
  }

  constructor() {
    // A stored value is untrusted (hand-edited, or from another version): fall back to the default.
    if (!SORT_MODE_VALUES.includes(this.sortMode())) this.sortMode.set('recommended');
    if (!VIEW_MODE_VALUES.includes(this.viewMode())) this.viewMode.set('table');
    this.seedFromUrl();

    effect(() => {
      const queryParams: Record<string, string | null> = {
        q: this.query().trim() || null,
        category: this.categoryFacet() !== 'all' ? this.categoryFacet() : null,
        platform: this.platformFacet() !== 'all' ? this.platformFacet() : null,
        status: this.statusFacet() !== 'all' ? this.statusFacet() : null,
        favorite: this.favoritesOnly() ? 'true' : null,
        recent: this.recentOnly() ? 'true' : null,
        sort: this.sortMode() !== 'recommended' ? this.sortMode() : null,
        view: this.viewMode() !== 'table' ? this.viewMode() : null,
      };
      void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
    });
  }

  private seedFromUrl(): void {
    const params = this.route.snapshot.queryParamMap;

    const q = params.get('q');
    if (q) this.query.set(q);

    const category = params.get('category');
    if (category && TOOL_CATEGORIES.includes(category as ToolCategory)) this.categoryFacet.set(category as ToolCategory);

    const platform = params.get('platform');
    if (platform && PLATFORM_VALUES.includes(platform as 'browser' | 'desktop')) this.platformFacet.set(platform as 'browser' | 'desktop');

    const status = params.get('status');
    if (status && STATUS_FACET_VALUES.includes(status as StatusFacet)) this.statusFacet.set(status as StatusFacet);

    if (params.get('favorite') === 'true') this.favoritesOnly.set(true);
    if (params.get('recent') === 'true') this.recentOnly.set(true);

    const sort = params.get('sort');
    if (sort && SORT_MODE_VALUES.includes(sort as BrowseToolsSortMode)) this.sortMode.set(sort as BrowseToolsSortMode);

    const view = params.get('view');
    if (view && VIEW_MODE_VALUES.includes(view as BrowseToolsViewMode)) this.viewMode.set(view as BrowseToolsViewMode);
  }

  /** Focuses the search box on `/`, mirroring the Command Palette's own discovery shortcut, unless the
   *  user is already typing somewhere else (another input, a textarea, or contenteditable). */
  @HostListener('document:keydown', ['$event'])
  protected onGlobalKeydown(event: KeyboardEvent): void {
    if (event.key !== '/') return;
    const active = document.activeElement;
    const isEditable = active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable);
    if (isEditable) return;
    event.preventDefault();
    this.searchInputRef?.nativeElement.focus();
  }

  protected onArrowDown(event: Event): void {
    event.preventDefault();
    const count = this.sorted().length;
    if (!count) return;
    this.selectedIndex.set((this.selectedIndex() + 1) % count);
  }

  protected onArrowUp(event: Event): void {
    event.preventDefault();
    const count = this.sorted().length;
    if (!count) return;
    this.selectedIndex.set((this.selectedIndex() - 1 + count) % count);
  }

  protected onEnter(): void {
    const id = this.selectedToolId();
    const tool = id ? this.registry.getById(id) : undefined;
    if (tool) void this.router.navigateByUrl(tool.route);
  }

  /** Clears the active filter state rather than dismissing anything else on the page. */
  protected onEscape(): void {
    this.query.set('');
    this.categoryFacet.set('all');
    this.platformFacet.set('all');
    this.statusFacet.set('all');
    this.favoritesOnly.set(false);
    this.recentOnly.set(false);
    this.selectedIndex.set(0);
  }

  protected onSortChange(event: Event): void {
    this.sortMode.set((event.target as HTMLSelectElement).value as BrowseToolsSortMode);
  }

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.selectedIndex.set(0);
  }

  protected onCategoryChange(event: Event): void {
    this.categoryFacet.set((event.target as HTMLSelectElement).value as ToolCategory | 'all');
  }

  protected onStatusChange(event: Event): void {
    this.statusFacet.set((event.target as HTMLSelectElement).value as StatusFacet);
  }
}
