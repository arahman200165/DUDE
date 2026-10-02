import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { DEFAULT_SMART_QUOTES_OPTIONS, Direction, normalizeSmartQuotes, SmartQuotesOptions } from "@dude/tool-engine/tools/smart-quotes-normalizer/smart-quotes-normalize";

@Component({
  selector: 'app-smart-quotes-normalizer',
  imports: [ToolShell, CopyButton],
  templateUrl: './smart-quotes-normalizer.html',
})
export class SmartQuotesNormalizer {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('smart-quotes-normalizer', 'input', 'session', '');
  protected readonly options = this.persistence.signal<SmartQuotesOptions>(
    'smart-quotes-normalizer',
    'options',
    'local',
    DEFAULT_SMART_QUOTES_OPTIONS,
  );

  protected readonly output = computed(() => normalizeSmartQuotes(this.input(), this.options()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setDirection(direction: Direction): void {
    this.options.update((o) => ({ ...o, direction }));
  }

  protected toggle(key: 'quotes' | 'dashes' | 'ellipsis'): void {
    this.options.update((o) => ({ ...o, [key]: !o[key] }));
  }

  protected clear(): void {
    this.input.set('');
  }
}
