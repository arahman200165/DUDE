import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  FindReplaceOptions,
  LineNumberOptions,
  PerLineTransform,
  addLineNumbers,
  addPrefixSuffix,
  applyPerLineTransform,
  removeLineNumbers,
} from "@dude/tool-engine/tools/line-prefix-numbering/line-prefix-numbering-logic";

type Mode = 'prefix-suffix' | 'add-numbers' | 'remove-numbers' | 'transform';

const TRANSFORMS: readonly { value: PerLineTransform; label: string }[] = [
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'trim', label: 'Trim' },
  { value: 'wrap-quotes', label: 'Wrap in "quotes"' },
  { value: 'find-replace', label: 'Find / Replace (literal)' },
];

@Component({
  selector: 'app-line-prefix-numbering',
  imports: [ToolShell, CopyButton],
  templateUrl: './line-prefix-numbering.html',
})
export class LinePrefixNumbering {
  private readonly persistence = inject(PersistenceService);

  protected readonly transforms = TRANSFORMS;

  protected readonly input = this.persistence.signal('line-prefix-numbering', 'input', 'session', '');
  protected readonly mode = this.persistence.signal<Mode>('line-prefix-numbering', 'mode', 'local', 'prefix-suffix');

  protected readonly prefix = this.persistence.signal('line-prefix-numbering', 'prefix', 'session', '');
  protected readonly suffix = this.persistence.signal('line-prefix-numbering', 'suffix', 'session', '');

  protected readonly numberOptions = this.persistence.signal<LineNumberOptions>(
    'line-prefix-numbering',
    'numberOptions',
    'local',
    { start: 1, padded: false, separator: '. ' },
  );

  protected readonly transform = this.persistence.signal<PerLineTransform>(
    'line-prefix-numbering',
    'transform',
    'local',
    'uppercase',
  );
  protected readonly findReplace = this.persistence.signal<FindReplaceOptions>(
    'line-prefix-numbering',
    'findReplace',
    'session',
    { find: '', replace: '' },
  );

  protected readonly result = computed(() => {
    const text = this.input();
    switch (this.mode()) {
      case 'prefix-suffix':
        return addPrefixSuffix(text, this.prefix(), this.suffix());
      case 'add-numbers':
        return addLineNumbers(text, this.numberOptions());
      case 'remove-numbers':
        return removeLineNumbers(text);
      case 'transform':
        return applyPerLineTransform(text, this.transform(), this.findReplace());
    }
  });

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected onPrefixChange(event: Event): void {
    this.prefix.set((event.target as HTMLInputElement).value);
  }

  protected onSuffixChange(event: Event): void {
    this.suffix.set((event.target as HTMLInputElement).value);
  }

  protected onStartChange(event: Event): void {
    const start = Number((event.target as HTMLInputElement).value) || 1;
    this.numberOptions.update((o) => ({ ...o, start }));
  }

  protected onSeparatorChange(event: Event): void {
    const separator = (event.target as HTMLInputElement).value;
    this.numberOptions.update((o) => ({ ...o, separator }));
  }

  protected togglePadded(): void {
    this.numberOptions.update((o) => ({ ...o, padded: !o.padded }));
  }

  protected onTransformChange(event: Event): void {
    this.transform.set((event.target as HTMLSelectElement).value as PerLineTransform);
  }

  protected onFindChange(event: Event): void {
    this.findReplace.update((o) => ({ ...o, find: (event.target as HTMLInputElement).value }));
  }

  protected onReplaceChange(event: Event): void {
    this.findReplace.update((o) => ({ ...o, replace: (event.target as HTMLInputElement).value }));
  }

  protected apply(): void {
    this.input.set(this.result());
  }
}
