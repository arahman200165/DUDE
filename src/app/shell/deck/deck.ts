import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CATEGORY_METADATA, ToolCategory, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { UsageService } from '../../core/usage/usage.service';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { PlatformService } from '../../core/platform/platform.service';
import { WorkspaceTemplateService } from '../../core/workspace/workspace-template.service';
import { ProjectService } from '../../core/project/project.service';
import { CategoryIcon } from '../../shared/components/category-icon/category-icon';
import { HomeRail } from './home-rail/home-rail';
import { PinnedPipelinesRail } from './pinned-pipelines-rail/pinned-pipelines-rail';
import { HomePasteDropHero } from './home-paste-drop-hero/home-paste-drop-hero';
import { RecentWorkspacesRail } from './recent-workspaces-rail/recent-workspaces-rail';
import { RecentProjectsRail } from './recent-projects-rail/recent-projects-rail';

const RAIL_LIMIT = 8;

@Component({
  selector: 'app-deck',
  imports: [RouterLink, CategoryIcon, HomeRail, PinnedPipelinesRail, HomePasteDropHero, RecentWorkspacesRail, RecentProjectsRail],
  templateUrl: './deck.html',
})
export class Deck {
  private readonly registry = inject(ToolRegistryService);
  private readonly usage = inject(UsageService);
  private readonly workspaceTemplates = inject(WorkspaceTemplateService);
  private readonly projects = inject(ProjectService);
  protected readonly favorites = inject(FavoritesService);
  protected readonly platform = inject(PlatformService);

  protected readonly meta = CATEGORY_METADATA;
  protected readonly query = signal('');

  /** Hidden entirely when empty — a first-time user sees today's plain grid, unchanged. */
  protected readonly recentTools = computed<readonly ToolDefinition[]>(() =>
    this.usage
      .mostRecent(RAIL_LIMIT)
      .map((id) => this.registry.getById(id))
      .filter((tool) => tool !== undefined),
  );

  /** Desktop-only (DUDE_PRD.md §21 Phase 25 Item 1) -- hidden entirely when empty, same precedent as Recently Used. */
  protected readonly recentWorkspaces = computed(() => this.workspaceTemplates.recentlyApplied(RAIL_LIMIT));
  protected readonly recentProjects = computed(() => this.projects.recentlyActivated(RAIL_LIMIT));

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

  /** Reuses the existing `--open-with-dude`/Explorer-association pipeline (`DesktopOpenService` picks
   *  up the resulting item off the same queue) -- this is only the picker trigger. */
  protected openFile(): void {
    void window.dude!.open.pickFile();
  }
}
