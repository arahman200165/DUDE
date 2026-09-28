import { Component, computed, input } from '@angular/core';
import { WorkbenchTable } from '../../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../../shared/components/workbench-table/simple-columns.pipe';
import { TreeDiffResult } from '../object-tree-diff';

function formatValue(value: unknown): string {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Renders a generic `TreeDiffResult` -- one renderer shared by all three semantic diff modes
 * (JSON/YAML/XML), which only differ in how the input was parsed, not in this diff shape.
 */
@Component({
  selector: 'app-semantic-diff-view',
  imports: [WorkbenchTable, SimpleColumnsPipe],
  templateUrl: './semantic-diff-view.html',
})
export class SemanticDiffView {
  readonly result = input.required<TreeDiffResult>();

  protected readonly columns = ['Path', 'Change', 'Old Value', 'New Value'] as const;

  protected readonly rows = computed(() =>
    this.result().entries.map((entry) => [entry.path, entry.op, formatValue(entry.oldValue), formatValue(entry.newValue)]),
  );
}
