import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ToolDefinition } from '../../models/tool-definition.model';
import { CATEGORY_METADATA } from '../../models/tool-category.model';
import { CategoryIcon } from '../category-icon/category-icon';
import { OfflineAvailability } from '../offline-badge/offline-availability.directive';
import { DesktopCapabilityBadge } from '../desktop-capability-badge/desktop-capability-badge';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { toolCapabilitySummary, toolStatusClass, toolStatusLabel } from '../../utils/tool-status';

/** Fixed row height (px) the `cdk-virtual-scroll-viewport` below sizes itself against. */
const ROW_HEIGHT = 28;

/**
 * Dense, virtualized table view for Browse Tools' Compact Table mode (DUDE_PRD.md §21 Phase 30A.2).
 * Deliberately separate from the existing `app-data-table` (`shared/components/data-table/`), which
 * is a plain string-cell primitive by design — this renders structured `ToolDefinition` rows
 * (favorite toggle, router link, category dot, capability badge) that a string-only table can't host.
 * Uses ARIA `role="table"`/`role="row"` div grids rather than `<table>`/`<tbody>`, since
 * `cdkVirtualFor` virtualizes a flat repeated block list and doesn't compose with `<tbody>` row
 * virtualization.
 */
@Component({
  selector: 'app-tool-table',
  imports: [RouterLink, ScrollingModule, CategoryIcon, OfflineAvailability, DesktopCapabilityBadge],
  templateUrl: './tool-table.html',
})
export class ToolTable {
  private readonly favorites = inject(FavoritesService);

  readonly rows = input.required<readonly ToolDefinition[]>();
  readonly toolOpened = output<string>();

  protected readonly meta = CATEGORY_METADATA;
  protected readonly rowHeight = ROW_HEIGHT;

  protected trackById(_index: number, tool: ToolDefinition): string {
    return tool.id;
  }

  protected isFavorite(id: string): boolean {
    return this.favorites.isToolPinned(id);
  }

  protected toggleFavorite(id: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.favorites.toggleTool(id);
  }

  protected readonly statusLabel = toolStatusLabel;
  protected readonly statusClass = toolStatusClass;
  protected readonly capabilitySummary = toolCapabilitySummary;
}
