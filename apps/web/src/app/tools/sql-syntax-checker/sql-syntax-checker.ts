import { Component, computed, inject, resource } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { loadSqlParser } from "@dude/tool-engine/shared/sql/sql-parser";
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

  private readonly parser = resource({ params: () => this.dialect(), loader: ({ params }) => loadSqlParser(params) });
  private readonly loadedParser = computed(() => (this.parser.hasValue() ? this.parser.value() : undefined));
  protected readonly parserLabel = computed(() => this.dialects.find((item) => item.id === this.dialect())?.label ?? this.dialect());
  protected readonly parserFailed = computed(() => this.parser.error() !== undefined);

  protected readonly result = computed(() => {
    const parser = this.loadedParser();
    return parser ? checkSqlSyntax(parser, this.input(), this.dialect()) : null;
  });

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDialectChange(event: Event): void {
    this.dialect.set((event.target as HTMLSelectElement).value as SqlCheckerDialect);
  }
}
