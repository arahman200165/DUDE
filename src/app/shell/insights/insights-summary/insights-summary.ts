import { Component, computed, inject } from '@angular/core';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { PlatformService } from '../../../core/platform/platform.service';
import { ProjectService } from '../../../core/project/project.service';
import { WorkspaceTemplateService } from '../../../core/workspace/workspace-template.service';
import { InsightsDataService } from '../insights-data.service';
import { SummaryTile, buildSummaryTiles } from '../insights-model';

const RECENT_LIMIT = 8;

/**
 * Compact strip of local workbench metrics (DUDE_PRD.md §21 Phase 30H.1). Only figures with a clear
 * practical reading: period metrics say whether the period is partial, lifetime metrics say
 * "lifetime". No scores, streaks or comparisons.
 */
@Component({
  selector: 'app-insights-summary',
  templateUrl: './insights-summary.html',
})
export class InsightsSummary {
  private readonly data = inject(InsightsDataService);
  private readonly favorites = inject(FavoritesService);
  private readonly platform = inject(PlatformService);
  private readonly projects = inject(ProjectService);
  private readonly workspaceTemplates = inject(WorkspaceTemplateService);

  protected readonly tiles = computed<SummaryTile[]>(() =>
    buildSummaryTiles({
      period: this.data.period(),
      topCategory: this.data.lifetimeCategories()[0],
      topTool: this.data.topTools()[0] && { title: this.data.topTools()[0].title, uses: this.data.topTools()[0].uses },
      favoriteCount: this.favorites.pinnedTools().length,
      pinnedPipelineCount: this.favorites.pinnedPipelines().length,
      recent: this.platform.isDesktop()
        ? {
            projects: this.projects.recentlyActivated(RECENT_LIMIT).length,
            workspaces: this.workspaceTemplates.recentlyApplied(RECENT_LIMIT).length,
          }
        : undefined,
    }),
  );
}
