import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { filterSortCsv, CsvFilterOperator, CsvFilterSortResult, CsvSortDirection } from './csv-filter-sort-transform';
import { CsvFilterSortPayload } from './csv-filter-sort-payload';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-csv-filter-sort',
  imports: [ToolShell, DataTable, SimpleColumnsPipe, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './csv-filter-sort.html',
})
export class CsvFilterSort {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('csv-filter-sort', 'input', 'session', '');
  protected readonly filterColumn = this.persistence.signal('csv-filter-sort', 'filterColumn', 'session', '');
  protected readonly operator = this.persistence.signal<CsvFilterOperator>('csv-filter-sort', 'operator', 'local', 'contains');
  protected readonly filterValue = this.persistence.signal('csv-filter-sort', 'filterValue', 'session', '');
  protected readonly sortColumn = this.persistence.signal('csv-filter-sort', 'sortColumn', 'session', '');
  protected readonly sortDirection = this.persistence.signal<CsvSortDirection>('csv-filter-sort', 'sortDirection', 'local', 'asc');

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<CsvFilterSortResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<CsvFilterSortResult | null>(() =>
    this.usesWorker()
      ? null
      : filterSortCsv(
          this.input(),
          this.filterColumn(),
          this.operator(),
          this.filterValue(),
          this.sortColumn(),
          this.sortDirection(),
        ),
  );

  protected readonly result = computed<CsvFilterSortResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const input = this.input();
      const filterColumn = this.filterColumn();
      const operator = this.operator();
      const filterValue = this.filterValue();
      const sortColumn = this.sortColumn();
      const sortDirection = this.sortDirection();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: CsvFilterSortPayload = { input, filterColumn, operator, filterValue, sortColumn, sortDirection };
      const job = this.workerClient.run<CsvFilterSortPayload, CsvFilterSortResult>(
        () => new Worker(new URL('./csv-filter-sort.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onFilterColumnChange(event: Event): void {
    this.filterColumn.set((event.target as HTMLInputElement).value);
  }

  protected onOperatorChange(event: Event): void {
    this.operator.set((event.target as HTMLSelectElement).value as CsvFilterOperator);
  }

  protected onFilterValueChange(event: Event): void {
    this.filterValue.set((event.target as HTMLInputElement).value);
  }

  protected onSortColumnChange(event: Event): void {
    this.sortColumn.set((event.target as HTMLInputElement).value);
  }

  protected setSortDirection(direction: CsvSortDirection): void {
    this.sortDirection.set(direction);
  }

  protected clear(): void {
    this.input.set('');
  }
}
