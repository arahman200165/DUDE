import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { HistoryHandoffService } from '../../../core/history/history-handoff.service';
import { DesktopOpenService } from '../../../core/platform/desktop-open.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { DashboardPanel } from '../../../shared/components/dashboard-panel/dashboard-panel';
import { DataTable, DataTableColumn } from '../../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../../shared/components/data-table/data-table-cell.directive';
import { InsightsDataService } from '../insights-data.service';
import { RecentActivityRow, buildRecentActivityRows, formatRelativeTime } from '../insights-model';

/**
 * Bounded Home/Insights view over Unified Recents (DUDE_PRD.md §21 Phase 30H.5), fed by
 * `UnifiedRecentsService.activityEntries` so only events with a real timestamp appear — open
 * workspace tabs never show up as activity. Read-only: it records nothing and stores nothing;
 * History/Recents remains the full destination.
 */
@Component({
  selector: 'app-recent-activity-table',
  imports: [DashboardPanel, DataTable, DataTableCellDef],
  templateUrl: './recent-activity-table.html',
})
export class RecentActivityTable {
  private readonly data = inject(InsightsDataService);
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly historyHandoff = inject(HistoryHandoffService);
  private readonly desktopOpen = inject(DesktopOpenService);
  private readonly router = inject(Router);

  /** Rows to show. */
  readonly limit = input(5);
  /** On Home: adds a "History & Recents" jump to the full destination. */
  readonly compact = input(false);

  private readonly now = new Date();

  protected readonly rows = computed<RecentActivityRow[]>(() =>
    buildRecentActivityRows(this.data.recentActivity(), { categoryLabel: (id) => this.data.categoryLabelOf(id) }, this.limit()),
  );

  protected readonly columns: readonly DataTableColumn<RecentActivityRow>[] = [
    { key: 'type', header: 'Type', value: (r) => r.typeLabel, sortable: true, width: '72px' },
    { key: 'item', header: 'Item', value: (r) => r.item, sortable: true },
    { key: 'context', header: 'Context', value: (r) => r.context, sortable: true, width: '110px' },
    { key: 'at', header: 'Last activity', value: (r) => r.at, sortable: true, width: '92px' },
    { key: 'action', header: '', value: () => '', width: '52px' },
  ];

  protected readonly trackRow = (_index: number, row: RecentActivityRow): string => row.key;

  protected relative(iso: string): string {
    return formatRelativeTime(iso, this.now);
  }

  protected viewAll(): void {
    void this.router.navigateByUrl('/history');
  }

  protected async open(row: RecentActivityRow, event?: Event): Promise<void> {
    event?.stopPropagation();
    const entry = row.entry;
    switch (entry.kind) {
      case 'tool': {
        const tool = this.registry.getById(entry.toolId);
        if (tool) this.launcher.open(tool);
        return;
      }
      case 'pipeline':
        await this.router.navigate(['/pipelines', entry.pipelineId]);
        return;
      case 'history':
        await this.historyHandoff.open(entry.entryId);
        return;
      case 'native-file':
        await this.desktopOpen.reopen(entry.path);
    }
  }
}
