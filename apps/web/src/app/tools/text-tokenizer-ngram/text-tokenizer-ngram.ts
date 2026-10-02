import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { NGramLevel, TokenGranularity, generateNGrams, tokenize } from "@dude/tool-engine/tools/text-tokenizer-ngram/text-tokenizer-ngram-logic";

type Mode = 'tokenize' | 'ngram';

@Component({
  selector: 'app-text-tokenizer-ngram',
  imports: [ToolShell, DataTable, SimpleColumnsPipe],
  templateUrl: './text-tokenizer-ngram.html',
})
export class TextTokenizerNGram {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('text-tokenizer-ngram', 'input', 'session', '');
  protected readonly mode = this.persistence.signal<Mode>('text-tokenizer-ngram', 'mode', 'local', 'tokenize');
  protected readonly granularity = this.persistence.signal<TokenGranularity>(
    'text-tokenizer-ngram',
    'granularity',
    'local',
    'word',
  );
  protected readonly ngramLevel = this.persistence.signal<NGramLevel>('text-tokenizer-ngram', 'ngramLevel', 'local', 'word');
  protected readonly n = this.persistence.signal('text-tokenizer-ngram', 'n', 'local', 2);

  protected readonly tokens = computed(() => tokenize(this.input(), this.granularity()).filter((t) => t.isWordLike));
  protected readonly ngrams = computed(() => generateNGrams(this.input(), this.ngramLevel(), this.n()));

  protected readonly tokenColumns = ['#', 'Token'] as const;
  protected readonly tokenRows = computed(() => this.tokens().map((t, i) => [(i + 1).toString(), t.text]));

  protected readonly ngramColumns = ['N-Gram', 'Count'] as const;
  protected readonly ngramRows = computed(() => this.ngrams().map((g) => [g.ngram, g.count.toString()]));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected onGranularityChange(event: Event): void {
    this.granularity.set((event.target as HTMLSelectElement).value as TokenGranularity);
  }

  protected onNGramLevelChange(event: Event): void {
    this.ngramLevel.set((event.target as HTMLSelectElement).value as NGramLevel);
  }

  protected onNChange(event: Event): void {
    const n = Number((event.target as HTMLInputElement).value) || 1;
    this.n.set(n);
  }
}
