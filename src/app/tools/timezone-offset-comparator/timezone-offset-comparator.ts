import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { listTimeZones } from '../../shared/utils/iana-timezones';
import { buildOffsetGrid, comparePairwise } from './timezone-offset-comparator-logic';

type ComparatorMode = 'grid' | 'pairwise';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

@Component({
  selector: 'app-timezone-offset-comparator',
  imports: [ToolShell, ErrorPanel, DataTable, SimpleColumnsPipe],
  templateUrl: './timezone-offset-comparator.html',
})
export class TimezoneOffsetComparator {
  private readonly persistence = inject(PersistenceService);

  protected readonly zones = listTimeZones();
  protected readonly mode = this.persistence.signal<ComparatorMode>('timezone-offset-comparator', 'mode', 'local', 'grid');

  protected readonly gridZonesText = this.persistence.signal(
    'timezone-offset-comparator',
    'gridZonesText',
    'session',
    'America/New_York, Europe/London',
  );
  protected readonly gridYear = this.persistence.signal('timezone-offset-comparator', 'gridYear', 'session', new Date().getFullYear());

  protected readonly zoneA = this.persistence.signal('timezone-offset-comparator', 'zoneA', 'local', 'America/New_York');
  protected readonly zoneB = this.persistence.signal('timezone-offset-comparator', 'zoneB', 'local', 'Europe/London');
  protected readonly momentInput = this.persistence.signal(
    'timezone-offset-comparator',
    'momentInput',
    'session',
    toDateTimeLocalValue(new Date()),
  );

  protected readonly gridZoneList = computed(() =>
    this.gridZonesText()
      .split(',')
      .map((zone) => zone.trim())
      .filter((zone) => zone !== ''),
  );

  protected readonly gridResult = computed(() => buildOffsetGrid({ zones: this.gridZoneList(), year: this.gridYear() }));

  protected readonly gridColumns = computed(() => ['Zone', ...MONTHS]);
  protected readonly gridRows = computed(() => {
    const result = this.gridResult();
    return result.ok ? result.rows.map((row) => [row.zone, ...row.monthlyOffsets]) : [];
  });

  protected readonly pairwiseResult = computed(() => {
    const ms = new Date(this.momentInput()).getTime();
    if (Number.isNaN(ms)) return { ok: false as const, error: 'Enter a valid date/time.' };
    return comparePairwise({ zoneA: this.zoneA(), zoneB: this.zoneB(), atMs: ms });
  });

  protected setMode(mode: ComparatorMode): void {
    this.mode.set(mode);
  }

  protected onGridZonesTextChange(event: Event): void {
    this.gridZonesText.set((event.target as HTMLTextAreaElement).value);
  }

  protected onGridYearChange(event: Event): void {
    this.gridYear.set(Number((event.target as HTMLInputElement).value));
  }

  protected onZoneAChange(event: Event): void {
    this.zoneA.set((event.target as HTMLSelectElement).value);
  }

  protected onZoneBChange(event: Event): void {
    this.zoneB.set((event.target as HTMLSelectElement).value);
  }

  protected onMomentInputChange(event: Event): void {
    this.momentInput.set((event.target as HTMLInputElement).value);
  }

  protected useNow(): void {
    this.momentInput.set(toDateTimeLocalValue(new Date()));
  }
}
