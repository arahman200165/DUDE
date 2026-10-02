import { Component, computed, inject } from '@angular/core';
import { DashboardPanel } from '../../../shared/components/dashboard-panel/dashboard-panel';
import { BarChart } from '../../../shared/components/workbench-charts/bar-chart';
import { InsightsDataService } from '../insights-data.service';
import { buildTrendBars, describePeriod } from "@dude/tool-engine/shell/insights/insights-model";

/**
 * "Tool opens — last 7 days" (DUDE_PRD.md §21 Phase 30H.2): one bar per local calendar day from
 * `UsageService`'s bounded daily buckets. The total shown under the chart is computed over the
 * exact days the chart marks as tracked, and a partial period is labeled with its tracking start.
 */
@Component({
  selector: 'app-activity-trend-panel',
  imports: [DashboardPanel, BarChart],
  templateUrl: './activity-trend-panel.html',
})
export class ActivityTrendPanel {
  private readonly data = inject(InsightsDataService);

  protected readonly bars = computed(() => buildTrendBars(this.data.period()));
  protected readonly summary = computed(() => describePeriod(this.data.period()));
  protected readonly hasTracking = computed(() => this.data.period().since !== null);
}
