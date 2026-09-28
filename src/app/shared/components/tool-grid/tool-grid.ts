import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ToolDefinition } from '../../models/tool-definition.model';
import { CATEGORY_METADATA } from '../../models/tool-category.model';
import { CategoryIcon } from '../category-icon/category-icon';
import { OfflineAvailability } from '../offline-badge/offline-availability.directive';
import { DesktopCapabilityBadge } from '../desktop-capability-badge/desktop-capability-badge';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { toolStatusClass, toolStatusLabel } from '../../utils/tool-status';

/** Fixed row height (px), matched to the compact card's rendered height for the virtual scroller. */
const ROW_HEIGHT = 88;

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Compact multi-column card view for Browse Tools' Grid mode (DUDE_PRD.md §21 Phase 30A.2) —
 * deliberately small entries (title, category accent, one-line description, platform indicator,
 * status chip, favorite star), not the old large category-wall card treatment. Virtualizes by row
 * (a fixed-height strip of `columns()` cards) rather than by individual card, since `cdkVirtualFor`
 * needs one flat, fixed-size, repeated block per item — an adaptive column count (like a CSS grid
 * auto-fill) can't drive its item sizing directly.
 */
@Component({
  selector: 'app-tool-grid',
  imports: [RouterLink, ScrollingModule, CategoryIcon, OfflineAvailability, DesktopCapabilityBadge],
  templateUrl: './tool-grid.html',
})
export class ToolGrid {
  private readonly destroyRef = inject(DestroyRef);
  private readonly favorites = inject(FavoritesService);

  readonly rows = input.required<readonly ToolDefinition[]>();
  readonly toolOpened = output<string>();

  protected readonly meta = CATEGORY_METADATA;
  protected readonly rowHeight = ROW_HEIGHT;
  protected readonly columns = signal(columnsForWidth(typeof window !== 'undefined' ? window.innerWidth : 1280));
  protected readonly chunkedRows = computed(() => chunk(this.rows(), this.columns()));

  constructor() {
    if (typeof window === 'undefined') return;
    const onResize = () => this.columns.set(columnsForWidth(window.innerWidth));
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
  }

  protected trackByRowIndex(index: number): number {
    return index;
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
}

function columnsForWidth(width: number): number {
  if (width < 480) return 1;
  if (width < 720) return 2;
  if (width < 1024) return 3;
  if (width < 1400) return 4;
  return 5;
}
