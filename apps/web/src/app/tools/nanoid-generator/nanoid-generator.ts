import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { generateNanoIds } from "@dude/tool-engine/tools/nanoid-generator/nanoid-logic";

@Component({
  selector: 'app-nanoid-generator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './nanoid-generator.html',
})
export class NanoidGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly count = this.persistence.signal('nanoid-generator', 'count', 'local', 5);
  protected readonly size = this.persistence.signal('nanoid-generator', 'size', 'local', 21);
  protected readonly alphabet = this.persistence.signal('nanoid-generator', 'alphabet', 'local', '');
  protected readonly generated = this.persistence.signal<readonly string[]>('nanoid-generator', 'generated', 'session', []);

  protected readonly error = computed(() => {
    const result = generateNanoIds(this.count(), this.size(), this.alphabet());
    return result.ok ? '' : result.error;
  });

  protected generate(): void {
    const result = generateNanoIds(this.count(), this.size(), this.alphabet());
    if (result.ok) this.generated.set(result.values);
  }

  protected clearGenerated(): void {
    this.generated.set([]);
  }

  protected onCountInput(event: Event): void {
    this.count.set(Number((event.target as HTMLInputElement).value));
  }

  protected onSizeInput(event: Event): void {
    this.size.set(Number((event.target as HTMLInputElement).value));
  }

  protected onAlphabetInput(event: Event): void {
    this.alphabet.set((event.target as HTMLInputElement).value);
  }
}
