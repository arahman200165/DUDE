import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { generatePalette, PALETTE_TYPES, type PaletteType } from './palette-generator-logic';

@Component({
  selector: 'app-palette-generator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './palette-generator.html',
})
export class PaletteGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly paletteTypes = PALETTE_TYPES;

  protected readonly inputPlaceholder = '#3b82f6, rgb(59,130,246), hsl(217,91%,60%)…';
  protected readonly input = this.persistence.signal('palette-generator', 'input', 'session', '#3b82f6');
  protected readonly type = this.persistence.signal<PaletteType>('palette-generator', 'type', 'local', 'complementary');

  protected readonly result = computed(() => generatePalette(this.input(), this.type()));

  protected readonly cssVars = computed(() => {
    const current = this.result();
    if (!current.ok) return '';
    return current.colors.map((c, i) => `--palette-${i + 1}: ${c};`).join('\n');
  });

  protected readonly json = computed(() => {
    const current = this.result();
    if (!current.ok) return '';
    return JSON.stringify(current.colors, null, 2);
  });

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }

  protected onTypeChange(event: Event): void {
    this.type.set((event.target as HTMLSelectElement).value as PaletteType);
  }
}
