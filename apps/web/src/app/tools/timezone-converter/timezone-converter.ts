import { pad } from "@dude/tool-engine/tools/timezone-converter/timezone-converter.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { convertToZones, listTimeZones } from "@dude/tool-engine/tools/timezone-converter/timezone-convert";

const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const now = new Date();


const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

@Component({
  selector: 'app-timezone-converter',
  imports: [ToolShell, ErrorPanel, DataTable, SimpleColumnsPipe],
  templateUrl: './timezone-converter.html',
})
export class TimezoneConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly zones = listTimeZones();

  protected readonly date = this.persistence.signal('timezone-converter', 'date', 'session', defaultDate);
  protected readonly time = this.persistence.signal('timezone-converter', 'time', 'session', defaultTime);
  protected readonly sourceZone = this.persistence.signal('timezone-converter', 'sourceZone', 'local', browserZone);

  protected readonly targetZones = this.persistence.signal<readonly string[]>('timezone-converter', 'targetZones', 'local', [
    'UTC',
    browserZone,
  ]);

  protected readonly zoneToAdd = signal(this.zones[0] ?? 'UTC');

  protected readonly result = computed(() =>
    convertToZones({ date: this.date(), time: this.time(), sourceZone: this.sourceZone() }, this.targetZones()),
  );

  protected readonly tableRows = computed(() => {
    const current = this.result();
    if (!current.ok) return [];
    return current.results.map((r) => [r.zone, r.formatted, r.utcOffset, r.isDst ? 'Yes' : 'No'] as const);
  });

  protected onDateChange(event: Event): void {
    this.date.set((event.target as HTMLInputElement).value);
  }

  protected onTimeChange(event: Event): void {
    this.time.set((event.target as HTMLInputElement).value);
  }

  protected onSourceZoneChange(event: Event): void {
    this.sourceZone.set((event.target as HTMLSelectElement).value);
  }

  protected onZoneToAddChange(event: Event): void {
    this.zoneToAdd.set((event.target as HTMLSelectElement).value);
  }

  protected addTargetZone(): void {
    const zone = this.zoneToAdd();
    if (this.targetZones().includes(zone)) return;
    this.targetZones.set([...this.targetZones(), zone]);
  }

  protected removeTargetZone(zone: string): void {
    this.targetZones.set(this.targetZones().filter((z) => z !== zone));
  }

  protected useNow(): void {
    const current = new Date();
    this.date.set(`${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`);
    this.time.set(`${pad(current.getHours())}:${pad(current.getMinutes())}`);
  }
}
