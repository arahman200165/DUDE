import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ConnectivityService } from '../../core/connectivity/connectivity.service';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { computeSelectionMetrics, computeTextMetrics } from './text-metrics';
import { computeReadability, readingEaseLabel } from './readability';
import { detectLanguage } from './language-detect';
import { checkGrammar, GrammarCheckResult } from './grammar-check';

interface Selection {
  readonly start: number;
  readonly end: number;
}

@Component({
  selector: 'app-text-inspector',
  imports: [ToolShell, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './text-inspector.html',
})
export class TextInspector {
  private readonly persistence = inject(PersistenceService);
  protected readonly connectivity = inject(ConnectivityService);

  protected readonly text = this.persistence.signal('text-inspector', 'text', 'session', '');
  protected readonly selection = signal<Selection>({ start: 0, end: 0 });

  protected readonly metrics = computed(() => computeTextMetrics(this.text()));
  protected readonly selectionMetrics = computed(() => {
    const { start, end } = this.selection();
    return computeSelectionMetrics(this.text(), start, end);
  });

  protected readonly showReadability = signal(false);
  protected readonly readability = computed(() => (this.showReadability() ? computeReadability(this.text()) : null));

  protected readonly showLanguage = signal(false);
  protected readonly languageGuesses = computed(() => (this.showLanguage() ? detectLanguage(this.text()) : []));

  protected readonly grammarPanelOpen = signal(false);
  protected readonly grammarStatus = signal<'idle' | 'checking'>('idle');
  protected readonly grammarResult = signal<GrammarCheckResult | null>(null);

  protected readingEaseLabel(score: number): string {
    return readingEaseLabel(score);
  }

  protected onTextInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
    this.grammarResult.set(null);
  }

  /** A whole new document: the old selection offsets and grammar findings no longer apply. */
  protected onFileLoaded(text: string): void {
    this.text.set(text);
    this.selection.set({ start: 0, end: 0 });
    this.grammarResult.set(null);
  }

  protected onSelectionChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.selection.set({ start: target.selectionStart, end: target.selectionEnd });
  }

  protected toggleReadability(): void {
    this.showReadability.set(!this.showReadability());
  }

  protected toggleLanguage(): void {
    this.showLanguage.set(!this.showLanguage());
  }

  protected toggleGrammarPanel(): void {
    this.grammarPanelOpen.set(!this.grammarPanelOpen());
  }

  protected async runGrammarCheck(): Promise<void> {
    this.grammarStatus.set('checking');
    const result = await checkGrammar(this.text());
    this.grammarResult.set(result);
    this.grammarStatus.set('idle');
  }

  protected clear(): void {
    this.text.set('');
    this.selection.set({ start: 0, end: 0 });
    this.grammarResult.set(null);
  }
}
