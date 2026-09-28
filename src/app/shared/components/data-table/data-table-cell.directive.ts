import { Directive, TemplateRef, inject, input } from '@angular/core';

export interface DataTableCellContext<T> {
  $implicit: T;
  row: T;
}

/**
 * Structural placeholder letting a caller supply custom cell content for one column — badges,
 * an inline action button, a link — matched to a `DataTableColumn.key` (DUDE_PRD.md §21
 * Phase 30C.2). A column without a matching template falls back to its plain-text `value()`.
 */
@Directive({ selector: 'ng-template[appDataTableCell]' })
export class DataTableCellDef<T = unknown> {
  readonly columnKey = input.required<string>({ alias: 'appDataTableCell' });
  readonly templateRef = inject<TemplateRef<DataTableCellContext<T>>>(TemplateRef);
}
