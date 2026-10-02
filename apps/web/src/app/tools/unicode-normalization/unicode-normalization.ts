import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { NormalizationForm, normalizeText } from "@dude/tool-engine/tools/unicode-normalization/unicode-normalize";

const FORMS: readonly NormalizationForm[] = ['NFC', 'NFD', 'NFKC', 'NFKD'];

@Component({
  selector: 'app-unicode-normalization',
  imports: [ToolShell, CopyButton],
  templateUrl: './unicode-normalization.html',
})
export class UnicodeNormalization {
  private readonly persistence = inject(PersistenceService);

  protected readonly forms = FORMS;

  protected readonly input = this.persistence.signal('unicode-normalization', 'input', 'session', '');
  protected readonly form = this.persistence.signal<NormalizationForm>('unicode-normalization', 'form', 'local', 'NFC');

  protected readonly result = computed(() => normalizeText(this.input(), this.form()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onFormChange(event: Event): void {
    this.form.set((event.target as HTMLSelectElement).value as NormalizationForm);
  }

  protected clear(): void {
    this.input.set('');
  }
}
