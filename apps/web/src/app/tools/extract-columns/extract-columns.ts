import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { extractColumns } from "@dude/tool-engine/tools/extract-columns/extract-columns-logic";

@Component({
  selector: 'app-extract-columns',
  imports: [ToolShell, CopyButton],
  templateUrl: './extract-columns.html',
})
export class ExtractColumns {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('extract-columns', 'input', 'session', '');
  protected readonly delimiter = this.persistence.signal('extract-columns', 'delimiter', 'local', ',');
  protected readonly columnSpec = this.persistence.signal('extract-columns', 'columnSpec', 'local', '1');
  protected readonly outputDelimiter = this.persistence.signal('extract-columns', 'outputDelimiter', 'local', ',');

  protected readonly result = computed(() =>
    extractColumns(this.input(), {
      delimiter: this.delimiter(),
      columnSpec: this.columnSpec(),
      outputDelimiter: this.outputDelimiter(),
    }),
  );

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDelimiterChange(event: Event): void {
    this.delimiter.set((event.target as HTMLInputElement).value);
  }

  protected onColumnSpecChange(event: Event): void {
    this.columnSpec.set((event.target as HTMLInputElement).value);
  }

  protected onOutputDelimiterChange(event: Event): void {
    this.outputDelimiter.set((event.target as HTMLInputElement).value);
  }
}
