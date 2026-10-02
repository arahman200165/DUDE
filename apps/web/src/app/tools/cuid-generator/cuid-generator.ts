import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { generateCuids } from "@dude/tool-engine/tools/cuid-generator/cuid-logic";

@Component({
  selector: 'app-cuid-generator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './cuid-generator.html',
})
export class CuidGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly count = this.persistence.signal('cuid-generator', 'count', 'local', 5);
  protected readonly length = this.persistence.signal('cuid-generator', 'length', 'local', 24);
  protected readonly generated = this.persistence.signal<readonly string[]>('cuid-generator', 'generated', 'session', []);

  protected readonly error = computed(() => {
    const result = generateCuids(this.count(), this.length());
    return result.ok ? '' : result.error;
  });

  protected generate(): void {
    const result = generateCuids(this.count(), this.length());
    if (result.ok) this.generated.set(result.values);
  }

  protected clearGenerated(): void {
    this.generated.set([]);
  }

  protected onCountInput(event: Event): void {
    this.count.set(Number((event.target as HTMLInputElement).value));
  }

  protected onLengthInput(event: Event): void {
    this.length.set(Number((event.target as HTMLInputElement).value));
  }
}
