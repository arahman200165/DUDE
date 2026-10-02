import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { CONVERTER_FLAVORS, ConverterFlavor, convertRegexFlavor } from "@dude/tool-engine/tools/regex-flavor-converter/regex-flavor-convert";

@Component({
  selector: 'app-regex-flavor-converter',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './regex-flavor-converter.html',
})
export class RegexFlavorConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly flavors = Object.entries(CONVERTER_FLAVORS) as [ConverterFlavor, string][];

  protected readonly pattern = this.persistence.signal('regex-flavor-converter', 'pattern', 'session', '(?<year>\\d{4})-(?<month>\\d{2})');
  protected readonly flags = this.persistence.signal('regex-flavor-converter', 'flags', 'session', '');
  protected readonly source = this.persistence.signal<ConverterFlavor>('regex-flavor-converter', 'source', 'local', 'js');
  protected readonly target = this.persistence.signal<ConverterFlavor>('regex-flavor-converter', 'target', 'local', 'python');

  protected readonly result = computed(() => convertRegexFlavor(this.pattern(), this.flags(), this.source(), this.target()));

  protected onPatternInput(event: Event): void {
    this.pattern.set((event.target as HTMLInputElement).value);
  }

  protected onFlagsInput(event: Event): void {
    this.flags.set((event.target as HTMLInputElement).value);
  }

  protected onSourceChange(event: Event): void {
    this.source.set((event.target as HTMLSelectElement).value as ConverterFlavor);
  }

  protected onTargetChange(event: Event): void {
    this.target.set((event.target as HTMLSelectElement).value as ConverterFlavor);
  }

  protected swap(): void {
    const [s, t] = [this.source(), this.target()];
    this.source.set(t);
    this.target.set(s);
  }
}
