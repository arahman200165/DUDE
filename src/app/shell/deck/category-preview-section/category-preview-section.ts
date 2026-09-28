import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CATEGORY_METADATA, ToolCategory, TOOL_CATEGORIES } from '../../../shared/models/tool-category.model';
import { ToolDefinition } from '../../../shared/models/tool-definition.model';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { UsageService } from '../../../core/usage/usage.service';
import { DashboardPanel } from '../../../shared/components/dashboard-panel/dashboard-panel';
import { OfflineAvailability } from '../../../shared/components/offline-badge/offline-availability.directive';

const PREVIEW_LIMIT = 6;

/**
 * Home's below-the-fold catalog preview (DUDE_PRD.md §21 Phase 30D.3, Model B: compact category
 * previews) — one small card per category showing a bounded, favorited/most-used-first sample of
 * its tools, a live registry-derived count, and a "View all N →" link into Browse Tools filtered
 * to that category. Complements the above-the-fold `CategoryStrip`; never renders every tool in
 * every category the way the retired full category/tool wall did.
 */
@Component({
  selector: 'app-category-preview-section',
  imports: [RouterLink, DashboardPanel, OfflineAvailability],
  templateUrl: './category-preview-section.html',
})
export class CategoryPreviewSection {
  private readonly registry = inject(ToolRegistryService);
  private readonly favorites = inject(FavoritesService);
  private readonly usage = inject(UsageService);
  private readonly router = inject(Router);

  protected readonly meta = CATEGORY_METADATA;

  protected readonly previews = computed(() => {
    const grouped = this.registry.groupedByCategory();
    return TOOL_CATEGORIES.map((category) => {
      const tools = (grouped[category] ?? []) as readonly ToolDefinition[];
      const ranked = [...tools].sort((a, b) => {
        const favoriteDelta = Number(this.favorites.isToolPinned(b.id)) - Number(this.favorites.isToolPinned(a.id));
        if (favoriteDelta !== 0) return favoriteDelta;
        return this.usage.frequencyOf(b.id) - this.usage.frequencyOf(a.id);
      });
      return { category, count: tools.length, tools: ranked.slice(0, PREVIEW_LIMIT) };
    });
  });

  protected viewAll(category: ToolCategory): void {
    void this.router.navigate(['/tools'], { queryParams: { category } });
  }
}
