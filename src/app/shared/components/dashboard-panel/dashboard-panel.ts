import { Component, input, output } from '@angular/core';
import { CATEGORY_METADATA } from '../../models/tool-category.model';
import type { ToolCategory } from '../../models/tool-category.model';
import { CategoryIcon } from '../category-icon/category-icon';

/**
 * Shared compact panel primitive for Home and other dashboard-like surfaces
 * (DUDE_PRD.md §21 Phase 30C.1) — header, optional category accent/count, a
 * projected body, optional projected action area and empty-state content, plus
 * loading state. Deliberately thin: it does not force a card-grid layout on
 * anything, and callers keep owning their own body markup via projection.
 */
@Component({
  selector: 'app-dashboard-panel',
  imports: [CategoryIcon],
  templateUrl: './dashboard-panel.html',
})
export class DashboardPanel {
  readonly title = input.required<string>();
  readonly category = input<ToolCategory | undefined>(undefined);
  readonly itemCount = input<number | undefined>(undefined);
  readonly loading = input(false);
  readonly empty = input(false);
  readonly viewAllLabel = input<string | undefined>(undefined);
  readonly viewAll = output<void>();

  protected readonly meta = CATEGORY_METADATA;
}
