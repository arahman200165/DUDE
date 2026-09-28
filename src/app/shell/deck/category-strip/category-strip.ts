import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CATEGORY_METADATA, TOOL_CATEGORIES } from '../../../shared/models/tool-category.model';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { computeCatalogCounts } from '../../../core/registry/browse-tools-counts';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { CategoryIcon } from '../../../shared/components/category-icon/category-icon';

/**
 * Home's bounded catalog entry point (DUDE_PRD.md §21 Phase 30D.3, Model A: category strip) — one
 * compact row of category name + registry-derived counts (`browse-tools-counts.ts`, the same
 * derivation Browse Tools and the sidebar already share), each linking into Browse Tools filtered
 * to that category. Never renders a tool itself, unlike the retired full category/tool wall.
 */
@Component({
  selector: 'app-category-strip',
  imports: [RouterLink, CategoryIcon],
  templateUrl: './category-strip.html',
})
export class CategoryStrip {
  private readonly registry = inject(ToolRegistryService);
  private readonly favorites = inject(FavoritesService);

  protected readonly categories = TOOL_CATEGORIES;
  protected readonly meta = CATEGORY_METADATA;

  protected readonly counts = computed(() =>
    computeCatalogCounts(this.registry.getAll(), {
      hasWebUnavailableFeature: (id) => this.registry.hasWebUnavailableFeature(id),
      isFavorite: (id) => this.favorites.isToolPinned(id),
    }),
  );
}
