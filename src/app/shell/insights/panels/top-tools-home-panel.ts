import { Component, inject } from '@angular/core';
import { PANEL_CONTEXT, panelNumber } from '../../../shared/models/panel-context.model';
import { TopToolsTable } from '../top-tools-table/top-tools-table';

/** Top Tools table on Home (compact); how many rows is per-instance config. */
@Component({
  selector: 'app-top-tools-home-panel',
  imports: [TopToolsTable],
  template: `<app-top-tools-table [limit]="limit" [compact]="true" />`,
})
export class TopToolsHomePanel {
  private readonly context = inject(PANEL_CONTEXT, { optional: true });
  protected get limit(): number {
    return panelNumber(this.context, 'limit', 5);
  }
}
