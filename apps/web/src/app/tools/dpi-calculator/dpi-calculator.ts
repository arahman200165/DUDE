import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { computeDpi, computePhysicalSizeForDpi, computePixelsForDpi, LengthUnit } from "@dude/tool-engine/tools/dpi-calculator/dpi-calculator-logic";

export type DpiCalculatorMode = 'find-dpi' | 'find-pixels' | 'find-physical-size';

@Component({
  selector: 'app-dpi-calculator',
  imports: [ToolShell],
  templateUrl: './dpi-calculator.html',
})
export class DpiCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<DpiCalculatorMode>('dpi-calculator', 'mode', 'local', 'find-dpi');
  protected readonly unit = this.persistence.signal<LengthUnit>('dpi-calculator', 'unit', 'local', 'in');

  protected readonly pixelWidth = this.persistence.signal('dpi-calculator', 'pixel-width', 'session', 1200);
  protected readonly pixelHeight = this.persistence.signal('dpi-calculator', 'pixel-height', 'session', 1800);
  protected readonly physicalWidth = this.persistence.signal('dpi-calculator', 'physical-width', 'session', 4);
  protected readonly physicalHeight = this.persistence.signal('dpi-calculator', 'physical-height', 'session', 6);
  protected readonly targetDpi = this.persistence.signal('dpi-calculator', 'target-dpi', 'session', 300);

  protected readonly dpiResult = computed(() => computeDpi(this.pixelWidth(), this.pixelHeight(), this.physicalWidth(), this.physicalHeight(), this.unit()));
  protected readonly pixelResult = computed(() => computePixelsForDpi(this.physicalWidth(), this.physicalHeight(), this.unit(), this.targetDpi()));
  protected readonly physicalResult = computed(() => computePhysicalSizeForDpi(this.pixelWidth(), this.pixelHeight(), this.targetDpi(), this.unit()));

  protected setMode(mode: DpiCalculatorMode): void {
    this.mode.set(mode);
  }

  protected setUnit(event: Event): void {
    this.unit.set((event.target as HTMLSelectElement).value as LengthUnit);
  }

  protected onNumberChange(signalRef: { set(value: number): void }, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value) && value >= 0) signalRef.set(value);
  }
}
