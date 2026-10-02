import { StatisticsCalculator_formatNumber } from "@dude/tool-engine/tools/statistics-calculator/statistics-calculator.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { computeStatistics, parseNumberList } from "@dude/tool-engine/tools/statistics-calculator/statistics-calculate";

@Component({
  selector: 'app-statistics-calculator',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './statistics-calculator.html',
})
export class StatisticsCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal(
    'statistics-calculator',
    'input',
    'session',
    '2, 4, 4, 4, 5, 5, 7, 9',
  );

  protected readonly result = computed(() => {
    const values = parseNumberList(this.input());
    if (values === null) return { ok: false as const, error: 'Enter numbers separated by commas, spaces, or newlines.' };
    return computeStatistics(values);
  });

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected formatNullable(value: number | null): string {
    return value === null ? 'N/A (needs 2+ values)' : this.formatNumber(value);
  }
  protected formatNumber = StatisticsCalculator_formatNumber;

}
