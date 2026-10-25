import { Component, computed, inject, resource } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { DiffView } from '../../shared/components/diff-view/diff-view';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { loadSqlParser } from "@dude/tool-engine/shared/sql/sql-parser";
import { diffSchemas, SCHEMA_DIFF_DIALECTS, type SchemaDiffDialect } from "@dude/tool-engine/tools/schema-diff/schema-diff-logic";

@Component({
  selector: 'app-schema-diff',
  imports: [ToolShell, ErrorPanel, DiffView, OpenTextFile, TextFileDrop],
  templateUrl: './schema-diff.html',
})
export class SchemaDiff {
  private readonly persistence = inject(PersistenceService);

  protected readonly dialects = SCHEMA_DIFF_DIALECTS;

  protected readonly before = this.persistence.signal('schema-diff', 'before', 'session', 'CREATE TABLE users (id INT NOT NULL, name VARCHAR(255))');
  protected readonly after = this.persistence.signal(
    'schema-diff',
    'after',
    'session',
    'CREATE TABLE users (id INT NOT NULL, name VARCHAR(255), email VARCHAR(255))',
  );
  protected readonly dialect = this.persistence.signal<SchemaDiffDialect>('schema-diff', 'dialect', 'local', 'postgresql');

  private readonly parser = resource({ params: () => this.dialect(), loader: ({ params }) => loadSqlParser(params) });
  private readonly loadedParser = computed(() => (this.parser.hasValue() ? this.parser.value() : undefined));
  protected readonly parserLabel = computed(() => this.dialects.find((item) => item.id === this.dialect())?.label ?? this.dialect());
  protected readonly parserFailed = computed(() => this.parser.error() !== undefined);

  protected readonly result = computed(() => {
    const parser = this.loadedParser();
    return parser ? diffSchemas(parser, this.before(), this.after(), this.dialect()) : null;
  });

  protected onBeforeInput(event: Event): void {
    this.before.set((event.target as HTMLTextAreaElement).value);
  }

  protected onAfterInput(event: Event): void {
    this.after.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDialectChange(event: Event): void {
    this.dialect.set((event.target as HTMLSelectElement).value as SchemaDiffDialect);
  }
}
