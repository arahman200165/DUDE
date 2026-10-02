import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { simplifyRatio } from "@dude/tool-engine/shared/utils/aspect-ratio";
import { megapixels, RESOLUTION_PRESETS } from "@dude/tool-engine/tools/resolution-calculator/resolution-calculator-logic";

@Component({
  selector: 'app-resolution-calculator',
  imports: [ToolShell],
  templateUrl: './resolution-calculator.html',
})
export class ResolutionCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly presets = RESOLUTION_PRESETS;
  protected readonly width = this.persistence.signal('resolution-calculator', 'width', 'session', 1920);
  protected readonly height = this.persistence.signal('resolution-calculator', 'height', 'session', 1080);

  protected readonly megapixelCount = computed(() => megapixels(this.width(), this.height()));
  protected readonly aspectRatio = computed(() => simplifyRatio(this.width(), this.height()));

  protected readonly matchingPreset = computed(() => this.presets.find((p) => p.width === this.width() && p.height === this.height())?.name ?? null);

  protected applyPreset(event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    const preset = this.presets.find((p) => p.name === name);
    if (preset) {
      this.width.set(preset.width);
      this.height.set(preset.height);
    }
  }

  protected onNumberChange(signalRef: { set(value: number): void }, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value) && value >= 0) signalRef.set(value);
  }
}
