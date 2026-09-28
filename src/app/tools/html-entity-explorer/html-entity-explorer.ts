import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { HTML_ENTITY_TABLE, filterEntityTable } from './html-entity-explorer-logic';

@Component({
  selector: 'app-html-entity-explorer',
  imports: [ToolShell, WorkbenchTable, SimpleColumnsPipe],
  templateUrl: './html-entity-explorer.html',
})
export class HtmlEntityExplorer {
  private readonly persistence = inject(PersistenceService);

  protected readonly filterText = this.persistence.signal('html-entity-explorer', 'filterText', 'local', '');
  protected readonly totalCount = HTML_ENTITY_TABLE.length;

  protected readonly columns = ['Char', 'Name', 'Entity', 'Decimal', 'Hex'] as const;

  protected readonly filtered = computed(() => filterEntityTable(HTML_ENTITY_TABLE, this.filterText()));

  protected readonly rows = computed(() =>
    this.filtered().map((entry) => [entry.char, entry.name, `&${entry.name};`, entry.decimal.toString(), `0x${entry.hex}`]),
  );

  protected onFilterInput(event: Event): void {
    this.filterText.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.filterText.set('');
  }
}
