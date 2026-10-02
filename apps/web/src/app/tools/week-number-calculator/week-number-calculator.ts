import { today } from "@dude/tool-engine/tools/week-number-calculator/week-number-calculator.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { dateToWeek, weekToDate } from "@dude/tool-engine/tools/week-number-calculator/week-number-calc";


@Component({
  selector: 'app-week-number-calculator',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './week-number-calculator.html',
})
export class WeekNumberCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly dateInput = this.persistence.signal('week-number-calculator', 'dateInput', 'session', today());

  protected readonly weekYearInput = this.persistence.signal('week-number-calculator', 'weekYearInput', 'session', new Date().getFullYear());
  protected readonly weekNumberInput = this.persistence.signal('week-number-calculator', 'weekNumberInput', 'session', 1);
  protected readonly weekdayInput = this.persistence.signal('week-number-calculator', 'weekdayInput', 'session', 1);

  protected readonly dateToWeekResult = computed(() => dateToWeek(this.dateInput()));
  protected readonly weekToDateResult = computed(() =>
    weekToDate({ weekYear: this.weekYearInput(), weekNumber: this.weekNumberInput(), weekday: this.weekdayInput() }),
  );

  protected onDateInputChange(event: Event): void {
    this.dateInput.set((event.target as HTMLInputElement).value);
  }

  protected onWeekYearInputChange(event: Event): void {
    this.weekYearInput.set(Number((event.target as HTMLInputElement).value));
  }

  protected onWeekNumberInputChange(event: Event): void {
    this.weekNumberInput.set(Number((event.target as HTMLInputElement).value));
  }

  protected onWeekdayInputChange(event: Event): void {
    this.weekdayInput.set(Number((event.target as HTMLSelectElement).value));
  }

  protected useTodayAsWeek(): void {
    const result = this.dateToWeekResult();
    if (!result.ok) return;
    this.weekYearInput.set(result.info.weekYear);
    this.weekNumberInput.set(result.info.weekNumber);
    this.weekdayInput.set(result.info.weekday);
  }
}
