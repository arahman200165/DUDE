import { Injectable, computed, inject } from '@angular/core';
import { UsageService } from '../../core/usage/usage.service';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { UnifiedRecentsService } from '../../core/recents/unified-recents.service';
import { rankCategoryUsage } from '../../core/usage/activity-summary';
import { CATEGORY_METADATA } from '../../shared/models/tool-category.model';
import { TopToolRow, ToolLookup, buildTopToolRows } from './insights-model';

/** Trailing window for the trend/summary — matches `MAX_DAILY_BUCKETS`'s 30-day store comfortably. */
export const INSIGHTS_PERIOD_DAYS = 7;

/**
 * Shared derived state for the Insights panels on Home and `/insights` (DUDE_PRD.md §21 Phase
 * 30H). A read-only view over `UsageService`/`UnifiedRecentsService`/the registry: it records
 * nothing, and none of it is persisted. Several panels need the same period/rankings, so they are
 * computed once here rather than re-derived per component.
 */
@Injectable({ providedIn: 'root' })
export class InsightsDataService {
  private readonly usage = inject(UsageService);
  private readonly registry = inject(ToolRegistryService);
  private readonly recents = inject(UnifiedRecentsService);

  private readonly isKnownTool = (toolId: string): boolean => this.registry.getById(toolId) !== undefined;
  private readonly categoryOf = (toolId: string) => this.registry.getById(toolId)?.category;

  /** The trailing 7 local days, with tracked/partial semantics from `UsageService`. */
  readonly period = computed(() => this.usage.activityPeriod(INSIGHTS_PERIOD_DAYS, new Date(), this.isKnownTool));

  /** Category ranking over lifetime counts (registry category metadata, no manual mapping). */
  readonly lifetimeCategories = computed(() => rankCategoryUsage(this.usage.lifetimeCounts(), this.categoryOf));

  /** Category ranking over the same tracked days as `period()`. */
  readonly periodCategories = computed(() => rankCategoryUsage(this.period().toolCounts, this.categoryOf));

  /** Every known tool ranked by lifetime uses; callers slice to their own bound. */
  readonly topTools = computed<readonly TopToolRow[]>(() =>
    buildTopToolRows(
      this.usage.lifetimeEntries(),
      (toolId): ToolLookup | undefined => this.registry.getById(toolId),
      Number.POSITIVE_INFINITY,
    ),
  );

  /** Real-event Unified Recents (no synthetic-timestamp workspace tabs). */
  readonly recentActivity = this.recents.activityEntries;

  categoryLabelOf(toolId: string): string | undefined {
    const category = this.categoryOf(toolId);
    return category === undefined ? undefined : CATEGORY_METADATA[category].label;
  }
}
