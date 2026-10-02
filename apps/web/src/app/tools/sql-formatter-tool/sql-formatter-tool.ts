import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { formatSql, SQL_DIALECTS, type SqlDialect, type SqlFormatMode } from "@dude/tool-engine/tools/sql-formatter-tool/sql-formatter-logic";

@Component({
  selector: 'app-sql-formatter-tool',
  imports: [ToolShell, ErrorPanel, CopyButton, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './sql-formatter-tool.html',
})
export class SqlFormatterTool {
  private readonly persistence = inject(PersistenceService);

  protected readonly dialects = SQL_DIALECTS;

  protected readonly input = this.persistence.signal('sql-formatter-tool', 'input', 'session', 'SELECT a, b FROM t WHERE x = 1;');
  protected readonly dialect = this.persistence.signal<SqlDialect>('sql-formatter-tool', 'dialect', 'local', 'sql');
  protected readonly mode = this.persistence.signal<SqlFormatMode>('sql-formatter-tool', 'mode', 'local', 'format');

  protected readonly result = computed(() => formatSql(this.input(), this.dialect(), this.mode()));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDialectChange(event: Event): void {
    this.dialect.set((event.target as HTMLSelectElement).value as SqlDialect);
  }

  protected onModeChange(event: Event): void {
    this.mode.set((event.target as HTMLSelectElement).value as SqlFormatMode);
  }
}
