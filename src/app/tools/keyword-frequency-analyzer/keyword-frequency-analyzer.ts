import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { KeywordFrequencyOptions, computeKeywordFrequency } from './keyword-frequency';

@Component({
  selector: 'app-keyword-frequency-analyzer',
  imports: [ToolShell, DataTable, SimpleColumnsPipe],
  templateUrl: './keyword-frequency-analyzer.html',
})
export class KeywordFrequencyAnalyzer {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('keyword-frequency-analyzer', 'input', 'session', '');
  protected readonly options = this.persistence.signal<KeywordFrequencyOptions>(
    'keyword-frequency-analyzer',
    'options',
    'local',
    { ignoreStopWords: true, minLength: 3, caseSensitive: false },
  );

  protected readonly entries = computed(() => computeKeywordFrequency(this.input(), this.options()));

  protected readonly columns = ['Word', 'Count'] as const;
  protected readonly rows = computed(() => this.entries().map((e) => [e.word, e.count.toString()]));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected toggleIgnoreStopWords(): void {
    this.options.update((o) => ({ ...o, ignoreStopWords: !o.ignoreStopWords }));
  }

  protected toggleCaseSensitive(): void {
    this.options.update((o) => ({ ...o, caseSensitive: !o.caseSensitive }));
  }

  protected onMinLengthChange(event: Event): void {
    const minLength = Number((event.target as HTMLInputElement).value) || 1;
    this.options.update((o) => ({ ...o, minLength }));
  }
}
