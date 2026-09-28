import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { buildResx, diffResx, extractTokens, mergeResx, parseResx } from './resx-transform';

type ResxMode = 'view' | 'diff' | 'merge' | 'tokens';

@Component({
  selector: 'app-resx-tool',
  imports: [ToolShell, ErrorPanel, DataTable, SimpleColumnsPipe],
  templateUrl: './resx-tool.html',
})
export class ResxTool {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<ResxMode>('resx-tool', 'mode', 'local', 'view');
  protected readonly baseInput = this.persistence.signal('resx-tool', 'baseInput', 'session', '');
  protected readonly overlayInput = this.persistence.signal('resx-tool', 'overlayInput', 'session', '');

  private readonly baseResult = computed(() => parseResx(this.baseInput()));
  private readonly overlayResult = computed(() => parseResx(this.overlayInput()));

  protected readonly needsOverlay = computed(() => this.mode() === 'diff' || this.mode() === 'merge');

  protected readonly errorMessage = computed(() => {
    const base = this.baseResult();
    if (!base.ok) return `Base: ${base.error.message}`;
    if (this.needsOverlay()) {
      const overlay = this.overlayResult();
      if (!overlay.ok) return `Overlay: ${overlay.error.message}`;
    }
    return null;
  });

  protected readonly viewTable = computed(() => {
    const base = this.baseResult();
    if (!base.ok) return null;
    return {
      columns: ['Name', 'Value', 'Comment'],
      rows: base.entries.map((entry) => [entry.name, entry.value, entry.comment ?? '']),
    };
  });

  protected readonly tokensTable = computed(() => {
    const base = this.baseResult();
    if (!base.ok) return null;
    return {
      columns: ['Name', 'Tokens'],
      rows: extractTokens(base.entries).map((entry) => [entry.name, entry.tokens.join(', ')]),
    };
  });

  protected readonly diffTable = computed(() => {
    const base = this.baseResult();
    const overlay = this.overlayResult();
    if (!base.ok || !overlay.ok) return null;
    return {
      columns: ['Name', 'Status', 'Base value', 'Overlay value'],
      rows: diffResx(base.entries, overlay.entries).map((entry) => [
        entry.name,
        entry.status,
        entry.baseValue ?? '',
        entry.overlayValue ?? '',
      ]),
    };
  });

  protected readonly mergedXml = computed(() => {
    const base = this.baseResult();
    const overlay = this.overlayResult();
    if (!base.ok || !overlay.ok) return null;
    return buildResx(mergeResx(base.entries, overlay.entries));
  });

  protected setMode(mode: ResxMode): void {
    this.mode.set(mode);
  }

  protected onBaseInputChange(event: Event): void {
    this.baseInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onOverlayInputChange(event: Event): void {
    this.overlayInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected copy(text: string): void {
    void navigator.clipboard.writeText(text);
  }
}
