import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
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

  protected readonly result = computed(() => explainSqlQuery(this.input(), this.dialect()));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDialectChange(event: Event): void {
    this.dialect.set((event.target as HTMLSelectElement).value as SqlExplainerDialect);
  }
}
