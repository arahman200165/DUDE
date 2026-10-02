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
import { pivotCsv, CsvPivotAggregation, CsvPivotResult } from "@dude/tool-engine/tools/csv-pivot/csv-pivot-transform";
import { CsvPivotPayload } from "@dude/tool-engine/tools/csv-pivot/csv-pivot-payload";

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-csv-pivot',
  imports: [ToolShell, DataTable, SimpleColumnsPipe, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './csv-pivot.html',
})
export class CsvPivot {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('csv-pivot', 'input', 'session', '');
  protected readonly rowKeyColumn = this.persistence.signal('csv-pivot', 'rowKeyColumn', 'session', '');
  protected readonly columnKeyColumn = this.persistence.signal('csv-pivot', 'columnKeyColumn', 'session', '');
  protected readonly valueColumn = this.persistence.signal('csv-pivot', 'valueColumn', 'session', '');
  protected readonly aggregation = this.persistence.signal<CsvPivotAggregation>('csv-pivot', 'aggregation', 'local', 'sum');

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<CsvPivotResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<CsvPivotResult | null>(() =>
    this.usesWorker()
      ? null
      : pivotCsv(this.input(), this.rowKeyColumn(), this.columnKeyColumn(), this.valueColumn(), this.aggregation()),
  );

  protected readonly result = computed<CsvPivotResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const input = this.input();
      const rowKeyColumn = this.rowKeyColumn();
      const columnKeyColumn = this.columnKeyColumn();
      const valueColumn = this.valueColumn();
      const aggregation = this.aggregation();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: CsvPivotPayload = { input, rowKeyColumn, columnKeyColumn, valueColumn, aggregation };
      const job = this.workerClient.run<CsvPivotPayload, CsvPivotResult>(
        () => new Worker(new URL('./csv-pivot.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRowKeyChange(event: Event): void {
    this.rowKeyColumn.set((event.target as HTMLInputElement).value);
  }

  protected onColumnKeyChange(event: Event): void {
    this.columnKeyColumn.set((event.target as HTMLInputElement).value);
  }

  protected onValueColumnChange(event: Event): void {
    this.valueColumn.set((event.target as HTMLInputElement).value);
  }

  protected setAggregation(aggregation: CsvPivotAggregation): void {
    this.aggregation.set(aggregation);
  }

  protected clear(): void {
    this.input.set('');
  }
}
