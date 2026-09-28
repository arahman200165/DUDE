import { Component, input } from '@angular/core';
import { ActivityTrendPanel } from '../activity-trend-panel/activity-trend-panel';
import { CategoryUsagePanel } from '../category-usage-panel/category-usage-panel';
import { InsightsSummary } from '../insights-summary/insights-summary';
import { RecentActivityTable } from '../recent-activity-table/recent-activity-table';
import { TopToolsTable } from '../top-tools-table/top-tools-table';

/**
 * The full local Insights layout (DUDE_PRD.md §21 Phase 30H) — one composition used by both Home
 * (`compact`: bounded slices, links to the full destinations) and `/insights` (larger slices).
 * Purely a view over local, content-free usage data; nothing here makes a network request.
 */
@Component({
  selector: 'app-insights-section',
  imports: [InsightsSummary, ActivityTrendPanel, CategoryUsagePanel, TopToolsTable, RecentActivityTable],
  templateUrl: './insights-section.html',
})
export class InsightsSection {
  readonly compact = input(false);
}
