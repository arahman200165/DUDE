import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { checkSqlSyntax, SQL_CHECKER_DIALECTS, type SqlCheckerDialect } from "@dude/tool-engine/tools/sql-syntax-checker/sql-syntax-checker-logic";

@Component({
  selector: 'app-sql-syntax-checker',
  imports: [ToolShell, OpenTextFile, TextFileDrop],
  templateUrl: './sql-syntax-checker.html',
})
export class SqlSyntaxChecker {
  private readonly persistence = inject(PersistenceService);

  protected readonly dialects = SQL_CHECKER_DIALECTS;

  protected readonly input = this.persistence.signal('sql-syntax-checker', 'input', 'session', 'SELECT a, b FROM t WHERE x = 1');
  protected readonly dialect = this.persistence.signal<SqlCheckerDialect>('sql-syntax-checker', 'dialect', 'local', 'postgresql');

  protected readonly result = computed(() => checkSqlSyntax(this.input(), this.dialect()));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDialectChange(event: Event): void {
    this.dialect.set((event.target as HTMLSelectElement).value as SqlCheckerDialect);
  }
}
