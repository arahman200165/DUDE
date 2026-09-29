import { Component, inject } from '@angular/core';
import { PANEL_CONTEXT, panelNumber } from '../../../shared/models/panel-context.model';
import { CategoryUsagePanel } from '../category-usage-panel/category-usage-panel';

/** Ranked category usage on Home; how many categories is per-instance config. */
@Component({
  selector: 'app-category-usage-home-panel',
  imports: [CategoryUsagePanel],
  template: `<app-category-usage-panel [limit]="limit" />`,
})
export class CategoryUsageHomePanel {
  private readonly context = inject(PANEL_CONTEXT, { optional: true });
  protected get limit(): number {
    return panelNumber(this.context, 'limit', 5);
  }
}
