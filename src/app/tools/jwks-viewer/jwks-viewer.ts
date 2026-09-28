import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { JwkSummary, JwksParseResult, parseJwks } from './jwks-viewer-logic';

@Component({
  selector: 'app-jwks-viewer',
  imports: [ToolShell, ErrorPanel, WorkbenchTable, SimpleColumnsPipe, CopyButton],
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

  private rowsFor(keys: readonly JwkSummary[]): readonly (readonly string[])[] {
    return keys.map((key) => [
      key.kid ?? '—',
      key.kty ?? '—',
      key.use ?? '—',
      key.alg ?? '—',
      key.importable ? 'Yes' : 'No',
      key.warnings.length > 0 ? key.warnings.join(' ') : '—',
    ]);
  }

  protected raw(key: JwkSummary): string {
    return JSON.stringify(key.raw, null, 2);
  }
}
