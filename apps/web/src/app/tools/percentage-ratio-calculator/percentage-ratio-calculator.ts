import { parseBigIntOrNull } from "@dude/tool-engine/tools/percentage-ratio-calculator/percentage-ratio-calculator.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { findTotal, percentChange, percentOf, scaleRatio, simplifyRatio, whatPercent } from "@dude/tool-engine/tools/percentage-ratio-calculator/percentage-ratio";

type Tab = 'percentage' | 'ratio';
type PercentMode = 'of' | 'whatPercent' | 'findTotal' | 'change';

@Component({
  selector: 'app-percentage-ratio-calculator',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './percentage-ratio-calculator.html',
})
export class PercentageRatioCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly tabs: readonly { readonly id: Tab; readonly label: string }[] = [
    { id: 'percentage', label: 'Percentage' },
    { id: 'ratio', label: 'Ratio' },
  ];
  protected readonly tab = this.persistence.signal<Tab>('percentage-ratio-calculator', 'tab', 'local', 'percentage');

  protected readonly percentModes: readonly { readonly id: PercentMode; readonly label: string }[] = [
    { id: 'of', label: 'X% of Y' },
    { id: 'whatPercent', label: 'X is what % of Y' },
    { id: 'findTotal', label: 'X is Y% of what' },
    { id: 'change', label: '% change, X to Y' },
  ];
  protected readonly percentMode = this.persistence.signal<PercentMode>('percentage-ratio-calculator', 'percentMode', 'local', 'of');

  protected readonly percentX = this.persistence.signal('percentage-ratio-calculator', 'percentX', 'session', '25');
  protected readonly percentY = this.persistence.signal('percentage-ratio-calculator', 'percentY', 'session', '200');

  protected readonly percentResult = computed(() => {
    const x = Number(this.percentX());
    const y = Number(this.percentY());
    switch (this.percentMode()) {
      case 'of':
        return percentOf(x, y);
      case 'whatPercent':
        return whatPercent(x, y);
      case 'findTotal':
        return findTotal(x, y);
      case 'change':
        return percentChange(x, y);
    }
  });

  protected readonly percentResultLabel = computed(() => {
    switch (this.percentMode()) {
      case 'of':
        return `${this.percentX()}% of ${this.percentY()} is`;
      case 'whatPercent':
        return `${this.percentX()} is this % of ${this.percentY()}`;
      case 'findTotal':
        return `${this.percentX()} is ${this.percentY()}% of`;
      case 'change':
        return `Change from ${this.percentX()} to ${this.percentY()} is`;
    }
  });

  protected readonly ratioA = this.persistence.signal('percentage-ratio-calculator', 'ratioA', 'session', '16');
  protected readonly ratioB = this.persistence.signal('percentage-ratio-calculator', 'ratioB', 'session', '9');
  protected readonly simplifyResult = computed(() => {
    const a = parseBigIntOrNull(this.ratioA());
    const b = parseBigIntOrNull(this.ratioB());
    if (a === null || b === null) return { ok: false as const, error: 'Enter whole numbers for A and B.' };
    return simplifyRatio(a, b);
  });

  protected readonly proportionA = this.persistence.signal('percentage-ratio-calculator', 'proportionA', 'session', '2');
  protected readonly proportionB = this.persistence.signal('percentage-ratio-calculator', 'proportionB', 'session', '3');
  protected readonly proportionC = this.persistence.signal('percentage-ratio-calculator', 'proportionC', 'session', '10');
  protected readonly proportionResult = computed(() =>
    scaleRatio(Number(this.proportionA()), Number(this.proportionB()), Number(this.proportionC())),
  );

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected setPercentMode(mode: PercentMode): void {
    this.percentMode.set(mode);
  }

  protected onPercentXChange(event: Event): void {
    this.percentX.set((event.target as HTMLInputElement).value);
  }

  protected onPercentYChange(event: Event): void {
    this.percentY.set((event.target as HTMLInputElement).value);
  }

  protected onRatioAChange(event: Event): void {
    this.ratioA.set((event.target as HTMLInputElement).value);
  }

  protected onRatioBChange(event: Event): void {
    this.ratioB.set((event.target as HTMLInputElement).value);
  }

  protected onProportionAChange(event: Event): void {
    this.proportionA.set((event.target as HTMLInputElement).value);
  }

  protected onProportionBChange(event: Event): void {
    this.proportionB.set((event.target as HTMLInputElement).value);
  }

  protected onProportionCChange(event: Event): void {
    this.proportionC.set((event.target as HTMLInputElement).value);
  }
}
