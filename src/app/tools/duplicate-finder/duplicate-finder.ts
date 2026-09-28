import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { findDuplicateLines, findDuplicateWords, removeDuplicateLines } from './duplicate-finder-logic';

type Mode = 'lines' | 'words';

@Component({
  selector: 'app-duplicate-finder',
  imports: [ToolShell, WorkbenchTable, SimpleColumnsPipe, CopyButton],
  templateUrl: './duplicate-finder.html',
})
export class DuplicateFinder {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('duplicate-finder', 'input', 'session', '');
  protected readonly mode = this.persistence.signal<Mode>('duplicate-finder', 'mode', 'local', 'lines');
  protected readonly caseSensitive = this.persistence.signal('duplicate-finder', 'caseSensitive', 'local', true);

  protected readonly duplicates = computed(() =>
    this.mode() === 'lines'
      ? findDuplicateLines(this.input(), this.caseSensitive())
      : findDuplicateWords(this.input(), this.caseSensitive()),
  );

  protected readonly columns = ['Value', 'Count', 'First Line'] as const;

  protected readonly rows = computed(() =>
    this.duplicates().map((entry) => [entry.value, entry.count.toString(), entry.firstLineNumber.toString()]),
  );

  protected readonly cleaned = computed(() => removeDuplicateLines(this.input(), this.caseSensitive()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected toggleCaseSensitive(): void {
    this.caseSensitive.update((c) => !c);
  }

  protected removeDuplicates(): void {
    this.input.set(this.cleaned());
  }
}
