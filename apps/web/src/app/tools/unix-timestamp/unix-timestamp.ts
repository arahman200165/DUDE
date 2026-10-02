import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PasteHandoffService } from '../../core/paste-detect/paste-handoff.service';
import {
  DisplayTimezone,
  NumericUnit,
  TimestampUnit,
  dateToTimestamp,
  formatDate,
  msToUnit,
  parseTimestamp,
  toDateTimeLocalValue,
  toHttpDate,
} from "@dude/tool-engine/tools/unix-timestamp/timestamp-convert";

@Component({
  selector: 'app-unix-timestamp',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './unix-timestamp.html',
})
export class UnixTimestamp {
  private readonly persistence = inject(PersistenceService);

  protected readonly unit = this.persistence.signal<TimestampUnit>('unix-timestamp', 'unit', 'local', 'auto');
  protected readonly tz = this.persistence.signal<DisplayTimezone>('unix-timestamp', 'tz', 'local', 'local');
  protected readonly timestampInput = this.persistence.signal('unix-timestamp', 'timestampInput', 'session', '');
  protected readonly dateInput = this.persistence.signal('unix-timestamp', 'dateInput', 'session', '');

  protected readonly effectiveUnit = computed<NumericUnit>(() => {
    const unit = this.unit();
    return unit === 'auto' ? 'seconds' : unit;
  });

  protected readonly timestampResult = computed(() => parseTimestamp(this.timestampInput(), this.unit()));
  protected readonly formattedDate = computed(() => {
    const result = this.timestampResult();
    return result.ok ? formatDate(result.date, this.tz()) : null;
  });

  protected readonly httpDate = computed(() => {
    const result = this.timestampResult();
    return result.ok ? toHttpDate(result.date) : null;
  });

  protected readonly dateResult = computed(() =>
    dateToTimestamp(this.dateInput(), this.tz(), this.effectiveUnit()),
  );

  constructor() {
    // Smart Paste-Detection prefill (DUDE_PRD.md §21 Phase 21 Item 3) — see PasteHandoffService.
    const handoff = inject(PasteHandoffService).consume('unix-timestamp');
    if (handoff !== undefined) this.timestampInput.set(handoff);
  }

  protected onUnitChange(event: Event): void {
    this.unit.set((event.target as HTMLSelectElement).value as TimestampUnit);
  }

  protected onTzChange(event: Event): void {
    this.tz.set((event.target as HTMLSelectElement).value as DisplayTimezone);
  }

  protected onTimestampInput(event: Event): void {
    this.timestampInput.set((event.target as HTMLInputElement).value);
  }

  protected onDateInput(event: Event): void {
    this.dateInput.set((event.target as HTMLInputElement).value);
  }

  protected now(): void {
    const nowDate = new Date();
    this.timestampInput.set(String(msToUnit(nowDate.getTime(), this.effectiveUnit())));
    this.dateInput.set(toDateTimeLocalValue(nowDate, this.tz()));
  }

  protected copy(value: string): void {
    void navigator.clipboard.writeText(value);
  }
}
