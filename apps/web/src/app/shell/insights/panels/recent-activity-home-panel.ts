import { Component, inject } from '@angular/core';
import { PANEL_CONTEXT, panelNumber } from '../../../shared/models/panel-context.model';
import { RecentActivityTable } from '../recent-activity-table/recent-activity-table';

/** Recent activity from Unified Recents on Home (compact); how many rows is per-instance config. */
@Component({
  selector: 'app-recent-activity-home-panel',
  imports: [RecentActivityTable],
  template: `<app-recent-activity-table [limit]="limit" [compact]="true" />`,
})
export class RecentActivityHomePanel {
  private readonly context = inject(PANEL_CONTEXT, { optional: true });
  protected get limit(): number {
    return panelNumber(this.context, 'limit', 5);
  }
}
