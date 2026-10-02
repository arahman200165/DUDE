import { today } from "@dude/tool-engine/tools/recurrence-rule/recurrence-rule.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { computeOccurrences } from "@dude/tool-engine/tools/recurrence-rule/recurrence-calc";

const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;


@Component({
  selector: 'app-recurrence-rule',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './recurrence-rule.html',
})
export class RecurrenceRule {
  private readonly persistence = inject(PersistenceService);

  protected readonly startDate = this.persistence.signal('recurrence-rule', 'startDate', 'session', today());
  protected readonly startTime = this.persistence.signal('recurrence-rule', 'startTime', 'session', '09:00');
  protected readonly ruleText = this.persistence.signal(
    'recurrence-rule',
    'ruleText',
    'session',
    'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10',
  );

  protected readonly timezone = this.persistence.signal('recurrence-rule', 'timezone', 'local', browserZone);
  protected readonly maxOccurrences = this.persistence.signal('recurrence-rule', 'maxOccurrences', 'local', 10);

  protected readonly result = computed(() =>
    computeOccurrences({
      startDate: this.startDate(),
      startTime: this.startTime(),
      ruleText: this.ruleText(),
      timezone: this.timezone(),
      maxOccurrences: this.maxOccurrences(),
    }),
  );

  protected onStartDateChange(event: Event): void {
    this.startDate.set((event.target as HTMLInputElement).value);
  }

  protected onStartTimeChange(event: Event): void {
    this.startTime.set((event.target as HTMLInputElement).value);
  }

  protected onRuleTextChange(event: Event): void {
    this.ruleText.set((event.target as HTMLInputElement).value);
  }

  protected onTimezoneChange(event: Event): void {
    this.timezone.set((event.target as HTMLInputElement).value);
  }

  protected onMaxOccurrencesChange(event: Event): void {
    this.maxOccurrences.set(Number((event.target as HTMLInputElement).value));
  }
}
