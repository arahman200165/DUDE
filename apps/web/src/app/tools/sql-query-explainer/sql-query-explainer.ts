import { Component, computed, inject, resource } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { loadSqlParser } from "@dude/tool-engine/shared/sql/sql-parser";
import { explainSqlQuery, SQL_EXPLAINER_DIALECTS, type SqlExplainerDialect } from "@dude/tool-engine/tools/sql-query-explainer/sql-query-explainer-logic";

@Component({
  selector: 'app-sql-query-explainer',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './sql-query-explainer.html',
})
export class SqlQueryExplainer {
  private readonly persistence = inject(PersistenceService);

  protected readonly dialects = SQL_EXPLAINER_DIALECTS;

  protected readonly input = this.persistence.signal(
    'sql-query-explainer',
    'input',
    'session',
    'SELECT a, COUNT(b) AS cnt FROM t1 JOIN t2 ON t1.id = t2.t1_id WHERE t1.x > 5 GROUP BY a HAVING COUNT(b) > 1 ORDER BY a DESC LIMIT 10',
  );
  protected readonly dialect = this.persistence.signal<SqlExplainerDialect>('sql-query-explainer', 'dialect', 'local', 'postgresql');

  private readonly parser = resource({ params: () => this.dialect(), loader: ({ params }) => loadSqlParser(params) });
  private readonly loadedParser = computed(() => (this.parser.hasValue() ? this.parser.value() : undefined));
  protected readonly parserLabel = computed(() => this.dialects.find((item) => item.id === this.dialect())?.label ?? this.dialect());
  protected readonly parserFailed = computed(() => this.parser.error() !== undefined);

  protected readonly result = computed(() => {
    const parser = this.loadedParser();
    return parser ? explainSqlQuery(parser, this.input(), this.dialect()) : null;
  });

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDialectChange(event: Event): void {
    this.dialect.set((event.target as HTMLSelectElement).value as SqlExplainerDialect);
  }
}
