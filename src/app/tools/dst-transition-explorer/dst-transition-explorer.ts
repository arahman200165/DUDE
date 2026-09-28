import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { listTimeZones } from '../../shared/utils/iana-timezones';
import { exploreDstTransitions } from './dst-transition-explorer-logic';

@Component({
  selector: 'app-dst-transition-explorer',
  imports: [ToolShell, ErrorPanel, DataTable, SimpleColumnsPipe],
  templateUrl: './dst-transition-explorer.html',
})
export class DstTransitionExplorer {
  private readonly persistence = inject(PersistenceService);

  protected readonly zones = listTimeZones();
  protected readonly zone = this.persistence.signal('dst-transition-explorer', 'zone', 'local', 'America/New_York');
  protected readonly year = this.persistence.signal('dst-transition-explorer', 'year', 'session', new Date().getFullYear());

  protected readonly result = computed(() => exploreDstTransitions(this.zone(), this.year()));

  protected readonly columns = ['Date', 'Local time', 'Direction', 'Offset change', 'Gap'] as const;
  protected readonly rows = computed(() => {
    const current = this.result();
    if (!current.ok) return [];
    return current.rows.map((row) => [
      row.date,
      `${row.localTimeBefore} → ${row.localTimeAfter}`,
      row.direction === 'spring-forward' ? 'Spring forward' : 'Fall back',
      `${row.fromOffset} → ${row.toOffset}`,
      `${row.gapMinutes} min`,
    ]);
  });

  protected onZoneChange(event: Event): void {
    this.zone.set((event.target as HTMLSelectElement).value);
  }

  protected onYearChange(event: Event): void {
    this.year.set(Number((event.target as HTMLInputElement).value));
  }
}
