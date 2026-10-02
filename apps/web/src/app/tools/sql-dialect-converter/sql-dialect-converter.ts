import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { convertSqlDialect, SQL_CONVERTER_DIALECTS, type SqlConverterDialect } from "@dude/tool-engine/tools/sql-dialect-converter/sql-dialect-converter-logic";

@Component({
  selector: 'app-sql-dialect-converter',
  imports: [ToolShell, ErrorPanel, CopyButton, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './sql-dialect-converter.html',
})
export class SqlDialectConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly dialects = SQL_CONVERTER_DIALECTS;

  protected readonly input = this.persistence.signal('sql-dialect-converter', 'input', 'session', 'SELECT a, b FROM t WHERE x = 1 LIMIT 10');
  protected readonly from = this.persistence.signal<SqlConverterDialect>('sql-dialect-converter', 'from', 'local', 'mysql');
  protected readonly to = this.persistence.signal<SqlConverterDialect>('sql-dialect-converter', 'to', 'local', 'postgresql');

  protected readonly result = computed(() => convertSqlDialect(this.input(), this.from(), this.to()));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onFromChange(event: Event): void {
    this.from.set((event.target as HTMLSelectElement).value as SqlConverterDialect);
  }

  protected onToChange(event: Event): void {
    this.to.set((event.target as HTMLSelectElement).value as SqlConverterDialect);
  }
}
