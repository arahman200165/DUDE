import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { LoremFormat, LoremOptions, LoremSource, LoremUnit, generateLorem } from "@dude/tool-engine/tools/lorem-ipsum-generator/lorem-ipsum-generate";

@Component({
  selector: 'app-lorem-ipsum-generator',
  imports: [ToolShell, CopyButton],
  templateUrl: './lorem-ipsum-generator.html',
})
export class LoremIpsumGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly options = this.persistence.signal<LoremOptions>('lorem-ipsum-generator', 'options', 'local', {
    source: 'classic',
    unit: 'paragraphs',
    count: 3,
    format: 'plain',
  });

  private readonly regenerateTick = signal(0);

  protected readonly output = computed(() => {
    this.regenerateTick();
    return generateLorem(this.options());
  });

  protected regenerate(): void {
    this.regenerateTick.update((n) => n + 1);
  }

  protected setSource(source: LoremSource): void {
    this.options.update((o) => ({ ...o, source }));
  }

  protected onUnitChange(event: Event): void {
    this.options.update((o) => ({ ...o, unit: (event.target as HTMLSelectElement).value as LoremUnit }));
  }

  protected onCountChange(event: Event): void {
    const count = Number((event.target as HTMLInputElement).value) || 1;
    this.options.update((o) => ({ ...o, count }));
  }

  protected onFormatChange(event: Event): void {
    this.options.update((o) => ({ ...o, format: (event.target as HTMLSelectElement).value as LoremFormat }));
  }
}
