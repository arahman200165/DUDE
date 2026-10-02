import { Component, TemplateRef, computed, contentChildren, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ValueDisclosure } from '../value-disclosure/value-disclosure';
import { DataTableCellDef, DataTableCellContext } from './data-table-cell.directive';
import { SortState, nextSortState, sortRows } from "@dude/tool-engine/shared/components/data-table/data-table-sort";

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: string;
  /** Plain-text accessor — drives the default text cell, the sort comparator, and truncation copy. */
  readonly value: (row: T) => string;
  readonly sortable?: boolean;
  /** CSS grid track for this column, e.g. `'1fr'` or `'110px'`. Defaults to `'1fr'`. */
  readonly width?: string;
  /** Truncates the plain-text cell with an accessible click/focus disclosure for the full value. */
  readonly truncate?: boolean;
}

/**
 * Unified shell-level table primitive (DUDE_PRD.md §21 Phase 30C.2) — the single shared table
 * for every tool and shell surface, replacing what used to be two separate implementations (a
 * plain string-cell table and a second, Browse-Tools-only virtualized grid): sortable,
 * dense-row-aware, optionally virtualized, and able to render custom cell content per column via
 * `appDataTableCell` templates (badges, inline actions) alongside plain-text columns. Uses ARIA
 * `role="table"`/`role="row"` div grids rather than `<table>`/`<tbody>`, since `cdkVirtualFor`
 * virtualizes a flat repeated block list and doesn't compose with native table row virtualization.
 */
@Component({
  selector: 'app-data-table',
  imports: [ScrollingModule, NgTemplateOutlet, ValueDisclosure],
  templateUrl: './data-table.html',
})
export class DataTable<T> {
  readonly columns = input.required<readonly DataTableColumn<T>[]>();
  readonly rows = input.required<readonly T[]>();
  readonly trackByFn = input<(index: number, row: T) => string | number>((index) => index);
  readonly dense = input(false);
  readonly sticky = input(true);
  /** Rows above this count are rendered through `cdk-virtual-scroll-viewport`; below it, plain `@for`. */
  readonly virtualizeThreshold = input(100);
  readonly rowHeight = input(28);
  readonly ariaLabel = input('Data');
  /**
   * When set, the highlighted row is driven entirely by the caller (e.g. Browse Tools' own
   * arrow-key handling on its search input) instead of this component's internal roving focus.
   */
  readonly selectedIndex = input<number | undefined>(undefined);

  readonly rowOpened = output<T>();

  private readonly cellTemplates = contentChildren(DataTableCellDef);

  protected readonly sort = signal<SortState | undefined>(undefined);
  private readonly internalFocusedIndex = signal(0);
  protected readonly focusedIndex = computed(() => this.selectedIndex() ?? this.internalFocusedIndex());

  protected readonly sortedRows = computed(() => sortRows(this.rows(), this.sort(), (row, key) => this.valueFor(row, key)));
  protected readonly virtualize = computed(() => this.rows().length > this.virtualizeThreshold());
  protected readonly gridTemplateColumns = computed(() => this.columns().map((column) => column.width ?? '1fr').join(' '));

  protected templateFor(key: string): TemplateRef<DataTableCellContext<T>> | undefined {
    return this.cellTemplates().find((def) => def.columnKey() === key)?.templateRef;
  }

  protected valueFor(row: T, key: string): string {
    const column = this.columns().find((c) => c.key === key);
    return column ? column.value(row) : '';
  }

  protected toggleSort(column: DataTableColumn<T>): void {
    if (!column.sortable) return;
    this.sort.set(nextSortState(this.sort(), column.key));
  }

  protected trackByRow = (index: number, row: T): string | number => this.trackByFn()(index, row);

  protected onArrowDown(event: Event): void {
    event.preventDefault();
    const count = this.sortedRows().length;
    if (!count) return;
    this.internalFocusedIndex.set(Math.min(this.internalFocusedIndex() + 1, count - 1));
  }

  protected onArrowUp(event: Event): void {
    event.preventDefault();
    if (!this.sortedRows().length) return;
    this.internalFocusedIndex.set(Math.max(this.internalFocusedIndex() - 1, 0));
  }

  protected onEnter(): void {
    const row = this.sortedRows()[this.focusedIndex()];
    if (row) this.rowOpened.emit(row);
  }

  protected onRowClick(index: number, row: T): void {
    this.internalFocusedIndex.set(index);
    this.rowOpened.emit(row);
  }
}
