import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  DEFAULT_WHITESPACE_OPTIONS,
  IndentStyle,
  LineEnding,
  TabConversion,
  WhitespaceCleanOptions,
  cleanWhitespace,
  migrateWhitespaceOptions,
} from "@dude/tool-engine/tools/whitespace-cleaner/whitespace-clean";

type ToggleKey = keyof Pick<
  WhitespaceCleanOptions,
  'trim' | 'collapseSpaces' | 'stripTrailingWhitespace' | 'removeBlankLines' | 'stripInvisibleChars' | 'reindent'
>;

@Component({
  selector: 'app-whitespace-cleaner',
  imports: [ToolShell],
  templateUrl: './whitespace-cleaner.html',
})
export class WhitespaceCleaner {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('whitespace-cleaner', 'input', 'session', '');
  protected readonly options = this.persistence.signal<WhitespaceCleanOptions>(
    'whitespace-cleaner',
    'options',
    'local',
    DEFAULT_WHITESPACE_OPTIONS,
  );

  protected readonly result = computed(() => cleanWhitespace(this.input(), this.options()));

  constructor() {
    // Backfills fields added after a user's options were first persisted (e.g. lineEnding replacing
    // the older boolean normalizeLineEndings) so a stale stored shape doesn't leave new fields undefined.
    this.options.update(migrateWhitespaceOptions);
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected toggle(key: ToggleKey): void {
    this.options.update((current) => ({ ...current, [key]: !current[key] }));
  }

  protected onLineEndingChange(event: Event): void {
    const lineEnding = (event.target as HTMLSelectElement).value as LineEnding;
    this.options.update((current) => ({ ...current, lineEnding }));
  }

  protected onTabConversionChange(event: Event): void {
    const tabConversion = (event.target as HTMLSelectElement).value as TabConversion;
    this.options.update((current) => ({ ...current, tabConversion }));
  }

  protected onTabWidthChange(event: Event): void {
    const tabWidth = Number((event.target as HTMLInputElement).value) || 1;
    this.options.update((current) => ({ ...current, tabWidth }));
  }

  protected onReindentFromWidthChange(event: Event): void {
    const reindentFromWidth = Number((event.target as HTMLInputElement).value) || 1;
    this.options.update((current) => ({ ...current, reindentFromWidth }));
  }

  protected onReindentToWidthChange(event: Event): void {
    const reindentToWidth = Number((event.target as HTMLInputElement).value) || 1;
    this.options.update((current) => ({ ...current, reindentToWidth }));
  }

  protected onReindentToStyleChange(event: Event): void {
    const reindentToStyle = (event.target as HTMLSelectElement).value as IndentStyle;
    this.options.update((current) => ({ ...current, reindentToStyle }));
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(): void {
    void navigator.clipboard.writeText(this.result());
  }
}
