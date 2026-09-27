import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { DiffView } from '../../shared/components/diff-view/diff-view';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { diffSchemas, SCHEMA_DIFF_DIALECTS, type SchemaDiffDialect } from './schema-diff-logic';

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

  protected readonly result = computed(() => diffSchemas(this.before(), this.after(), this.dialect()));

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
