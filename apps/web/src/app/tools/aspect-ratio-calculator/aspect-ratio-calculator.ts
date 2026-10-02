import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { parseRatio, simplifyRatio, solveHeightForRatio, solveWidthForRatio } from "@dude/tool-engine/shared/utils/aspect-ratio";

export type AspectRatioMode = 'simplify' | 'solve';
export type SolveFor = 'width' | 'height';

@Component({
  selector: 'app-aspect-ratio-calculator',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './aspect-ratio-calculator.html',
})
export class AspectRatioCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<AspectRatioMode>('aspect-ratio-calculator', 'mode', 'local', 'simplify');
  protected readonly solveFor = this.persistence.signal<SolveFor>('aspect-ratio-calculator', 'solve-for', 'local', 'height');

  protected readonly width = this.persistence.signal('aspect-ratio-calculator', 'width', 'session', 1920);
  protected readonly height = this.persistence.signal('aspect-ratio-calculator', 'height', 'session', 1080);
  protected readonly targetRatio = this.persistence.signal('aspect-ratio-calculator', 'target-ratio', 'session', '16:9');
  protected readonly knownDimension = this.persistence.signal('aspect-ratio-calculator', 'known-dimension', 'session', 1920);

  protected readonly simplified = computed(() => simplifyRatio(this.width(), this.height()));

  protected readonly parsedTargetRatio = computed(() => parseRatio(this.targetRatio()));

  protected readonly solveResult = computed<number | null>(() => {
    const ratio = this.parsedTargetRatio();
    if (!ratio) return null;
    return this.solveFor() === 'height'
      ? solveHeightForRatio(this.knownDimension(), ratio.width, ratio.height)
      : solveWidthForRatio(this.knownDimension(), ratio.width, ratio.height);
  });

  protected setMode(mode: AspectRatioMode): void {
    this.mode.set(mode);
  }

  protected setSolveFor(solveFor: SolveFor): void {
    this.solveFor.set(solveFor);
  }

  protected onNumberChange(signalRef: { set(value: number): void }, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value) && value >= 0) signalRef.set(value);
  }

  protected onTargetRatioChange(event: Event): void {
    this.targetRatio.set((event.target as HTMLInputElement).value);
  }
}
