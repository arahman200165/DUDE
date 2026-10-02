import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { CategoryIcon } from '../../../shared/components/category-icon/category-icon';
import { DashboardPanel } from '../../../shared/components/dashboard-panel/dashboard-panel';
import { DataTable, DataTableColumn } from '../../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../../shared/components/data-table/data-table-cell.directive';
import { CATEGORY_METADATA } from "@dude/shared-types/shared/models/tool-category.model";
import { InsightsDataService } from '../insights-data.service';
import { TopToolRow, formatRelativeTime } from "@dude/tool-engine/shell/insights/insights-model";

/**
 * Dense local Top Tools table (DUDE_PRD.md §21 Phase 30H.4) on the shared `app-data-table`. Use
 * counts are lifetime counts and say so. Sorting is the table's own; the favorite star toggles
 * inline through `FavoritesService`; Enter (row focus) and the Open button both launch the tool
 * from the registry route.
 */
@Component({
  selector: 'app-top-tools-table',
  imports: [DashboardPanel, DataTable, DataTableCellDef, CategoryIcon, RouterLink],
  templateUrl: './top-tools-table.html',
})
export class TopToolsTable {
  private readonly data = inject(InsightsDataService);
  private readonly favorites = inject(FavoritesService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly registry = inject(ToolRegistryService);
  private readonly router = inject(Router);

  /** Rows to show. */
  readonly limit = input(10);
  /** On Home: adds a "View all" jump to `/insights`. */
  readonly compact = input(false);

  protected readonly rows = computed(() => this.data.topTools().slice(0, this.limit()));
  private readonly now = new Date();

  protected readonly columns: readonly DataTableColumn<TopToolRow>[] = [
    { key: 'favorite', header: '', value: () => '', width: '28px' },
    { key: 'tool', header: 'Tool', value: (r) => r.title, sortable: true },
    { key: 'category', header: 'Category', value: (r) => r.categoryLabel, sortable: true, width: '110px' },
    { key: 'uses', header: 'Uses', value: (r) => String(r.uses), sortable: true, width: '56px' },
    { key: 'last', header: 'Last used', value: (r) => r.lastUsedAt, sortable: true, width: '84px' },
    { key: 'action', header: '', value: () => '', width: '52px' },
  ];

  protected readonly trackRow = (_index: number, row: TopToolRow): string => row.id;

  /** Category accent suffix (`cat-data`, ...) — a method because cell-template rows are untyped. */
  protected color(row: TopToolRow): string {
    return CATEGORY_METADATA[row.category].colorToken;
  }

  protected isFavorite(id: string): boolean {
    return this.favorites.isToolPinned(id);
  }

  protected toggleFavorite(id: string, event: Event): void {
    event.stopPropagation();
    this.favorites.toggleTool(id);
  }

  protected relative(iso: string): string {
    return formatRelativeTime(iso, this.now);
  }

  protected open(row: TopToolRow, event?: Event): void {
    event?.stopPropagation();
    const tool = this.registry.getById(row.id);
    if (tool) this.launcher.open(tool);
  }

  protected viewAll(): void {
    void this.router.navigateByUrl('/insights');
  }
}
