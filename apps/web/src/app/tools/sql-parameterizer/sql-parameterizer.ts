import { Component, computed, inject } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  parameterizeSql,
  SQL_PARAMETERIZER_DIALECTS,
  SQL_PARAM_STYLES,
  type SqlParameterizerDialect,
  type SqlParamStyle,
} from "@dude/tool-engine/tools/sql-parameterizer/sql-parameterizer-logic";

@Component({
  selector: 'app-sql-parameterizer',
  imports: [ToolShell, ErrorPanel, CopyButton, JsonPipe, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './sql-parameterizer.html',
})
export class SqlParameterizer {
  private readonly persistence = inject(PersistenceService);

  protected readonly dialects = SQL_PARAMETERIZER_DIALECTS;
  protected readonly styles = SQL_PARAM_STYLES;

  protected readonly input = this.persistence.signal('sql-parameterizer', 'input', 'session', "SELECT * FROM t WHERE x = 1 AND y = 'hello'");
  protected readonly dialect = this.persistence.signal<SqlParameterizerDialect>('sql-parameterizer', 'dialect', 'local', 'postgresql');
  protected readonly style = this.persistence.signal<SqlParamStyle>('sql-parameterizer', 'style', 'local', 'question');

  protected readonly result = computed(() => parameterizeSql(this.input(), this.dialect(), this.style()));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDialectChange(event: Event): void {
    this.dialect.set((event.target as HTMLSelectElement).value as SqlParameterizerDialect);
  }

  protected onStyleChange(event: Event): void {
    this.style.set((event.target as HTMLSelectElement).value as SqlParamStyle);
  }
}
