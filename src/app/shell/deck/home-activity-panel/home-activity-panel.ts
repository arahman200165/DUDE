import { Component, computed, inject } from '@angular/core';
import { UsageService } from '../../../core/usage/usage.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { CATEGORY_METADATA } from '../../../shared/models/tool-category.model';
import { DashboardPanel } from '../../../shared/components/dashboard-panel/dashboard-panel';
import { SparklineChart } from '../../../shared/components/workbench-charts/sparkline-chart';
import { RankedBarsChart, RankedBarInput } from '../../../shared/components/workbench-charts/ranked-bars-chart';
import { SparklinePoint } from '../../../shared/components/workbench-charts/sparkline-chart-option';

const TREND_DAYS = 7;
const TOP_TOOLS_LIMIT = 5;

/**
 * Home's compact local activity/usage summary (DUDE_PRD.md §21 Phase 30D.1/30H.1) — a read-only
 * view over the existing `UsageService` store (`recentLogRaw()`/`mostFrequent()`), no new
 * recording or second store. Uses the Phase 30C shared chart primitives
 * (`app-sparkline-chart`/`app-ranked-bars-chart`), their first real Home consumers.
 */
@Component({
  selector: 'app-home-activity-panel',
  imports: [DashboardPanel, SparklineChart, RankedBarsChart],
  templateUrl: './home-activity-panel.html',
})
export class HomeActivityPanel {
  private readonly usage = inject(UsageService);
  private readonly registry = inject(ToolRegistryService);

  private readonly meta = CATEGORY_METADATA;

  protected readonly hasActivity = computed(() => this.usage.recentLogRaw().length > 0);

  private readonly period = computed(() =>
    this.usage.activityPeriod(TREND_DAYS, new Date(), (id) => this.registry.getById(id) !== undefined),
  );

  protected readonly trend = computed<readonly SparklinePoint[]>(() =>
    this.period().days.map((day) => ({ label: day.label, value: day.opens ?? 0 })),
  );

  protected readonly trendTotal = computed(() => this.period().totalOpens);

  /** "since <date>" while the 7-day window isn't fully tracked yet; `null` once complete. */
  protected readonly partialSince = computed(() => {
    const { complete, since } = this.period();
    return complete ? null : since;
  });

  protected readonly topTools = computed<readonly RankedBarInput[]>(() =>
    this.usage
      .mostFrequent(TOP_TOOLS_LIMIT)
      .map((id) => this.registry.getById(id))
      .filter((tool) => tool !== undefined)
      .map((tool) => ({
        label: tool.shortTitle ?? tool.title,
        value: this.usage.frequencyOf(tool.id),
        colorToken: `--color-${this.meta[tool.category].colorToken}`,
      })),
  );
}
