import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { generateRange, padNumber } from "@dude/tool-engine/tools/range-generator/range-generate";

type Separator = 'newline' | 'comma' | 'json';

@Component({
  selector: 'app-range-generator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './range-generator.html',
})
export class RangeGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly start = this.persistence.signal('range-generator', 'start', 'session', '1');
  protected readonly end = this.persistence.signal('range-generator', 'end', 'session', '10');
  protected readonly step = this.persistence.signal('range-generator', 'step', 'session', '1');
  protected readonly padWidth = this.persistence.signal('range-generator', 'padWidth', 'local', 0);
  protected readonly separator = this.persistence.signal<Separator>('range-generator', 'separator', 'local', 'newline');

  protected readonly separators: readonly { readonly id: Separator; readonly label: string }[] = [
    { id: 'newline', label: 'Newline' },
    { id: 'comma', label: 'Comma' },
    { id: 'json', label: 'JSON array' },
  ];

  protected readonly result = computed(() =>
    generateRange({ start: Number(this.start()), end: Number(this.end()), step: Number(this.step()) }),
  );

  protected readonly formatted = computed(() => {
    const result = this.result();
    if (!result.ok) return '';

    const values = result.value.map((v) => padNumber(v, this.padWidth()));
    switch (this.separator()) {
      case 'newline':
        return values.join('\n');
      case 'comma':
        return values.join(', ');
      case 'json':
        return JSON.stringify(result.value.map((v) => (this.padWidth() > 0 ? padNumber(v, this.padWidth()) : v)));
    }
  });

  protected onStartChange(event: Event): void {
    this.start.set((event.target as HTMLInputElement).value);
  }

  protected onEndChange(event: Event): void {
    this.end.set((event.target as HTMLInputElement).value);
  }

  protected onStepChange(event: Event): void {
    this.step.set((event.target as HTMLInputElement).value);
  }

  protected onPadWidthChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.padWidth.set(Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);
  }

  protected setSeparator(separator: Separator): void {
    this.separator.set(separator);
  }
}
