import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ASCII_TABLE } from './ascii-table-data';
import { filterAsciiTable } from './ascii-table-search';

@Component({
  selector: 'app-ascii-table',
  imports: [ToolShell, WorkbenchTable, SimpleColumnsPipe],
  templateUrl: './ascii-table.html',
})
export class AsciiTable {
  private readonly persistence = inject(PersistenceService);

  protected readonly filterText = this.persistence.signal('ascii-table', 'filterText', 'local', '');
  protected readonly totalCount = ASCII_TABLE.length;

  protected readonly columns = ['Dec', 'Hex', 'Oct', 'Char', 'Name', 'Category'] as const;

  protected readonly filtered = computed(() => filterAsciiTable(ASCII_TABLE, this.filterText()));

  protected readonly rows = computed(() =>
    this.filtered().map((entry) => [
      entry.decimal.toString(),
      entry.hex,
      entry.octal,
      entry.char,
      entry.name,
      entry.category,
    ]),
  );

  protected onFilterInput(event: Event): void {
    this.filterText.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.filterText.set('');
  }
}
