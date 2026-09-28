import { Component, signal } from '@angular/core';
import { DashboardPanel } from '../../shared/components/dashboard-panel/dashboard-panel';
import { DataTable, DataTableColumn } from '../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../shared/components/data-table/data-table-cell.directive';
import { SparklineChart } from '../../shared/components/workbench-charts/sparkline-chart';
import { RankedBarsChart } from '../../shared/components/workbench-charts/ranked-bars-chart';
import { SparklinePoint } from '../../shared/components/workbench-charts/sparkline-chart-option';
import { RankedBarInput } from '../../shared/components/workbench-charts/ranked-bars-chart';

interface DemoRow {
  readonly tool: string;
  readonly category: string;
  readonly uses: number;
  readonly lastUsed: string;
}

const DEMO_ROWS: readonly DemoRow[] = [
  { tool: 'Base64', category: 'Encoding', uses: 42, lastUsed: 'This is a much longer last-used description used to exercise truncation and the disclosure popover.' },
  { tool: 'Regex Tester', category: 'Text', uses: 27, lastUsed: '5 minutes ago' },
  { tool: 'JWT Verify', category: 'Security', uses: 15, lastUsed: 'Yesterday' },
  { tool: 'CSV Viewer', category: 'Data', uses: 9, lastUsed: 'Last week' },
];

const SPARKLINE_POINTS: readonly SparklinePoint[] = [3, 5, 4, 8, 6, 9, 7].map((value, index) => ({
  label: `Day ${index + 1}`,
  value,
}));

const RANKED_ITEMS: readonly RankedBarInput[] = [
  { label: 'Developer', value: 42, colorToken: '--color-cat-developer' },
  { label: 'Data', value: 30, colorToken: '--color-cat-data' },
  { label: 'Security', value: 18, colorToken: '--color-cat-security' },
  { label: 'Text', value: 10, colorToken: '--color-cat-text' },
];

/**
 * Dev-only, never-shipped preview of Phase 30C's shared workbench primitives (dashboard panel,
 * unified data table, charts), used to eyeball dark-mode contrast/keyboard behavior in `ng serve`
 * before Phase 30D-H build any real Home consumer. Registered only when `isDevMode()` (see
 * `core/routing/app.routes.ts`). Remove this whole directory and its route once 30D-H land real
 * consumers of these primitives (tracked in DUDE_PRD.md's Phase 30 exit gate).
 */
@Component({
  selector: 'app-primitives-preview',
  imports: [DashboardPanel, DataTable, DataTableCellDef, SparklineChart, RankedBarsChart],
  templateUrl: './primitives-preview.html',
})
export class PrimitivesPreview {
  protected readonly rows = signal(DEMO_ROWS);
  protected readonly sparklinePoints = SPARKLINE_POINTS;
  protected readonly rankedItems = RANKED_ITEMS;

  protected readonly loading = signal(false);
  protected readonly empty = signal(false);

  protected readonly columns: readonly DataTableColumn<DemoRow>[] = [
    { key: 'tool', header: 'Tool', value: (r) => r.tool, sortable: true, width: '1fr' },
    { key: 'category', header: 'Category', value: (r) => r.category, sortable: true, width: '120px' },
    { key: 'uses', header: 'Uses', value: (r) => String(r.uses), sortable: true, width: '80px' },
    { key: 'lastUsed', header: 'Last used', value: (r) => r.lastUsed, width: '1fr', truncate: true },
  ];

  protected toggleLoading(): void {
    this.loading.update((v) => !v);
  }

  protected toggleEmpty(): void {
    this.empty.update((v) => !v);
  }
}
