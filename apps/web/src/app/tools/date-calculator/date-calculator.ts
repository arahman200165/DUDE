import { today } from "@dude/tool-engine/tools/date-calculator/date-calculator.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { addDays, daysBetween, parseHolidays, type AddMode } from "@dude/tool-engine/tools/date-calculator/date-calc";


@Component({
  selector: 'app-date-calculator',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './date-calculator.html',
})
export class DateCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly addStartDate = this.persistence.signal('date-calculator', 'addStartDate', 'session', today());
  protected readonly amount = this.persistence.signal('date-calculator', 'amount', 'session', 10);
  protected readonly addMode = this.persistence.signal<AddMode>('date-calculator', 'addMode', 'local', 'calendar');

  protected readonly rangeStartDate = this.persistence.signal('date-calculator', 'rangeStartDate', 'session', today());
  protected readonly rangeEndDate = this.persistence.signal('date-calculator', 'rangeEndDate', 'session', today());

  protected readonly holidaysText = this.persistence.signal('date-calculator', 'holidaysText', 'session', '');

  private readonly holidays = computed(() => parseHolidays(this.holidaysText()));

  protected readonly addResult = computed(() =>
    addDays({ startDate: this.addStartDate(), amount: this.amount(), mode: this.addMode(), holidays: this.holidays() }),
  );

  protected readonly betweenResult = computed(() =>
    daysBetween({ startDate: this.rangeStartDate(), endDate: this.rangeEndDate(), holidays: this.holidays() }),
  );

  protected onAddStartDateChange(event: Event): void {
    this.addStartDate.set((event.target as HTMLInputElement).value);
  }

  protected onAmountChange(event: Event): void {
    this.amount.set(Number((event.target as HTMLInputElement).value));
  }

  protected onAddModeChange(event: Event): void {
    this.addMode.set((event.target as HTMLSelectElement).value as AddMode);
  }

  protected onRangeStartDateChange(event: Event): void {
    this.rangeStartDate.set((event.target as HTMLInputElement).value);
  }

  protected onRangeEndDateChange(event: Event): void {
    this.rangeEndDate.set((event.target as HTMLInputElement).value);
  }

  protected onHolidaysTextChange(event: Event): void {
    this.holidaysText.set((event.target as HTMLTextAreaElement).value);
  }
}
