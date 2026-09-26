import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CATEGORY_METADATA, ToolCategory, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { UsageService } from '../../core/usage/usage.service';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { CategoryIcon } from '../../shared/components/category-icon/category-icon';
import { HomeRail } from './home-rail/home-rail';

const RAIL_LIMIT = 8;

@Component({
  selector: 'app-deck',
  imports: [RouterLink, CategoryIcon, HomeRail],
  templateUrl: './deck.html',
})
export class Deck {
  private readonly registry = inject(ToolRegistryService);
  private readonly usage = inject(UsageService);
  protected readonly favorites = inject(FavoritesService);

  protected readonly meta = CATEGORY_METADATA;
  protected readonly query = signal('');

  /** Hidden entirely when empty — a first-time user sees today's plain grid, unchanged. */
  protected readonly recentTools = computed<readonly ToolDefinition[]>(() =>
    this.usage
      .mostRecent(RAIL_LIMIT)
      .map((id) => this.registry.getById(id))
      .filter((tool) => tool !== undefined),
  );

  protected readonly isFiltering = computed(() => this.query().trim().length > 0);

  private readonly filteredGrouped = computed(() => {
    const results = this.registry.search(this.query());
    const grouped = new Map<ToolCategory, ToolDefinition[]>();
    for (const tool of results) {
      const bucket = grouped.get(tool.category) ?? [];
      bucket.push(tool);
      grouped.set(tool.category, bucket);
    }
    return grouped;
  });

  protected readonly grouped = computed(() =>
    this.isFiltering() ? this.filteredGrouped() : new Map(Object.entries(this.registry.groupedByCategory()) as [ToolCategory, ToolDefinition[]][]),
  );

  protected readonly categories = computed(() =>
    this.isFiltering() ? [...this.filteredGrouped().keys()] : TOOL_CATEGORIES,
  );

  protected readonly hasResults = computed(() => !this.isFiltering() || this.filteredGrouped().size > 0);

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
