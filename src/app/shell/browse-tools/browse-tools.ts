import { Component, computed, inject, signal } from '@angular/core';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { CATEGORY_METADATA, ToolCategory, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { ToolTable } from '../../shared/components/tool-table/tool-table';
import { ToolGrid } from '../../shared/components/tool-grid/tool-grid';

/** Synthetic pseudo-tool-id namespace, the same trick `'__favorites__'`/`'__usage__'` use. */
const BROWSE_TOOLS_NAMESPACE = '__browse_tools__';

export type BrowseToolsViewMode = 'table' | 'grid';

/**
 * Browse Tools (`/tools`) — the dedicated, exhaustive tool catalog (DUDE_PRD.md §21 Phase 30A.1),
 * the ninth sanctioned shell exception (see `shell/AGENTS.md`). Deck's own "Browse all tools" grid
 * is left untouched here (Phase 30D's job) — this route becomes the authoritative complete-registry
 * surface search/filter/sort grow into across the rest of Phase 30A's milestones.
 */
@Component({
  selector: 'app-browse-tools',
  imports: [ToolTable, ToolGrid],
  templateUrl: './browse-tools.html',
})
export class BrowseTools {
  private readonly registry = inject(ToolRegistryService);
  private readonly persistence = inject(PersistenceService);

  protected readonly meta = CATEGORY_METADATA;
  protected readonly categories = TOOL_CATEGORIES;

  protected readonly viewMode = this.persistence.signal<BrowseToolsViewMode>(BROWSE_TOOLS_NAMESPACE, 'viewMode', 'local', 'table');

  protected readonly query = signal('');
  protected readonly categoryFacet = signal<ToolCategory | 'all'>('all');
  protected readonly platformFacet = signal<'all' | 'browser' | 'desktop'>('all');
  protected readonly platformFacets = [
    { id: 'all', label: 'All' },
    { id: 'browser', label: 'Works fully in browser' },
    { id: 'desktop', label: 'Desktop-enhanced' },
  ] as const;

  protected readonly total = computed(() => this.registry.getAll().length);

  protected readonly filtered = computed<readonly ToolDefinition[]>(() => {
    const category = this.categoryFacet();
    const platform = this.platformFacet();
    const base = this.query().trim() ? this.registry.search(this.query()) : [...this.registry.getAll()];
    return base.filter((tool) => {
      if (category !== 'all' && tool.category !== category) return false;
      if (platform === 'all') return true;
      const enhanced = this.registry.platformCapabilitiesOf(tool.id).length > 0;
      return platform === 'desktop' ? enhanced : !enhanced;
    });
  });

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onCategoryChange(event: Event): void {
    this.categoryFacet.set((event.target as HTMLSelectElement).value as ToolCategory | 'all');
  }
}
