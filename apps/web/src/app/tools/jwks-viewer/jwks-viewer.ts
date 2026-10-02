import { JwksViewer_rowsFor, JwksViewer_raw } from "@dude/tool-engine/tools/jwks-viewer/jwks-viewer.embedded-engine";
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { JwkSummary, JwksParseResult, parseJwks } from "@dude/tool-engine/tools/jwks-viewer/jwks-viewer-logic";

@Component({
  selector: 'app-jwks-viewer',
  imports: [ToolShell, ErrorPanel, DataTable, SimpleColumnsPipe, CopyButton],
  templateUrl: './jwks-viewer.html',
})
export class JwksViewer {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('jwks-viewer', 'input', 'none', '');

  private readonly resultSignal = signal<JwksParseResult | null>(null);
  protected readonly result = this.resultSignal.asReadonly();

  protected readonly columns = ['Kid', 'Type', 'Use', 'Alg', 'Importable', 'Warnings'] as const;
  protected readonly rows = computed(() => {
    const current = this.resultSignal();
    return current && current.ok ? this.rowsFor(current.keys) : [];
  });

  constructor() {
    effect(() => {
      const text = this.input();
      if (text.trim() === '') {
        this.resultSignal.set(null);
        return;
      }
      parseJwks(text).then((result) => this.resultSignal.set(result));
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.input.set('');
  }
  private rowsFor = JwksViewer_rowsFor;

  protected raw = JwksViewer_raw;

}
