import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { CREATE_TABLE_DIALECTS, generateCreateTable, type CreateTableDialect } from "@dude/tool-engine/tools/create-table-generator/create-table-generator-logic";

const DEFAULT_SAMPLE = JSON.stringify(
  [
    { id: 1, name: 'Ada Lovelace', active: true, joined: '2020-01-01' },
    { id: 2, name: 'Grace Hopper', active: false, joined: '2021-06-15' },
  ],
  null,
  2,
);

@Component({
  selector: 'app-create-table-generator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './create-table-generator.html',
})
export class CreateTableGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly dialects = CREATE_TABLE_DIALECTS;

  protected readonly sample = this.persistence.signal('create-table-generator', 'sample', 'local', DEFAULT_SAMPLE);
  protected readonly tableName = this.persistence.signal('create-table-generator', 'tableName', 'local', 'users');
  protected readonly dialect = this.persistence.signal<CreateTableDialect>('create-table-generator', 'dialect', 'local', 'postgresql');

  protected readonly result = computed(() => generateCreateTable(this.sample(), this.tableName(), this.dialect()));

  protected onSampleInput(event: Event): void {
    this.sample.set((event.target as HTMLTextAreaElement).value);
  }

  protected onTableNameInput(event: Event): void {
    this.tableName.set((event.target as HTMLInputElement).value);
  }

  protected onDialectChange(event: Event): void {
    this.dialect.set((event.target as HTMLSelectElement).value as CreateTableDialect);
  }
}
