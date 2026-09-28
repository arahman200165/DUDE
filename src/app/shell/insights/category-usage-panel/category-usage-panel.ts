import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryIcon } from '../../../shared/components/category-icon/category-icon';
import { DashboardPanel } from '../../../shared/components/dashboard-panel/dashboard-panel';
import { RankedBarInput, RankedBarsChart } from '../../../shared/components/workbench-charts/ranked-bars-chart';
import { CATEGORY_METADATA } from '../../../shared/models/tool-category.model';
import { InsightsDataService } from '../insights-data.service';
import { CategoryBarRow, toCategoryBarRows } from '../insights-model';

type CategoryPeriod = 'lifetime' | '7d';

/**
 * Ranked category usage (DUDE_PRD.md §21 Phase 30H.3): horizontal bars, category accent color as
 * identity, derived from registry category metadata + recorded counts (no hand-kept mapping). The
 * default is labeled lifetime; the 7-day view uses the daily buckets and is labeled partial
 * whenever the trend period is.
 */
@Component({
  selector: 'app-category-usage-panel',
  imports: [DashboardPanel, RankedBarsChart, RouterLink, CategoryIcon],
  templateUrl: './category-usage-panel.html',
})
export class CategoryUsagePanel {
  private readonly data = inject(InsightsDataService);

  /** How many categories to list. */
  readonly limit = input(5);

  protected readonly meta = CATEGORY_METADATA;
  protected readonly mode = signal<CategoryPeriod>('lifetime');

  protected readonly rows = computed<CategoryBarRow[]>(() =>
    toCategoryBarRows(this.mode() === 'lifetime' ? this.data.lifetimeCategories() : this.data.periodCategories(), this.limit()),
  );

  protected readonly bars = computed<readonly RankedBarInput[]>(() =>
    this.rows().map((row) => ({ label: row.label, value: row.opens, colorToken: row.colorToken })),
  );

  protected readonly caption = computed(() => {
    if (this.mode() === 'lifetime') return 'Lifetime opens by category';
    const { complete, since } = this.data.period();
    return complete || since === null ? 'Opens by category, last 7 days' : 'Opens by category, last 7 days (partial period)';
  });

  protected setMode(mode: CategoryPeriod): void {
    this.mode.set(mode);
  }
}
