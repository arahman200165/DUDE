import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { convertScientific } from "@dude/tool-engine/tools/scientific-notation-converter/scientific-notation-convert";

@Component({
  selector: 'app-scientific-notation-converter',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './scientific-notation-converter.html',
})
export class ScientificNotationConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('scientific-notation-converter', 'input', 'session', '6.022e23');
  protected readonly precision = this.persistence.signal('scientific-notation-converter', 'precision', 'local', 6);

  protected readonly result = computed(() => convertScientific(this.input(), this.precision()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }

  protected onPrecisionChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.precision.set(Number.isFinite(value) ? Math.min(21, Math.max(1, Math.trunc(value))) : 6);
  }
}
