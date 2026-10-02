import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ASCII_TABLE } from "@dude/tool-engine/tools/ascii-table/ascii-table-data";
import { filterAsciiTable } from "@dude/tool-engine/tools/ascii-table/ascii-table-search";

@Component({
  selector: 'app-ascii-table',
  imports: [ToolShell, DataTable, SimpleColumnsPipe],
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
