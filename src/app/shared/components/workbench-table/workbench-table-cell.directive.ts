import { Directive, TemplateRef, inject, input } from '@angular/core';

export interface WorkbenchTableCellContext<T> {
  $implicit: T;
  row: T;
}

/**
 * Structural placeholder letting a caller supply custom cell content for one column — badges,
 * an inline action button, a link — matched to a `WorkbenchTableColumn.key` (DUDE_PRD.md §21
 * Phase 30C.2). A column without a matching template falls back to its plain-text `value()`.
 */
@Directive({ selector: 'ng-template[appWorkbenchTableCell]' })
export class WorkbenchTableCellDef<T = unknown> {
  readonly columnKey = input.required<string>({ alias: 'appWorkbenchTableCell' });
  readonly templateRef = inject<TemplateRef<WorkbenchTableCellContext<T>>>(TemplateRef);
}
