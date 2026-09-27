import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { TextInputHandoffService } from '../../core/text-file-input/text-input-handoff.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { convertCsvSql, CsvSqlDirection, CsvSqlResult } from './csv-sql-transform';
import { CsvSqlPayload } from './csv-sql-payload';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-csv-sql',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './csv-sql.html',
})
export class CsvSql {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('csv-sql', 'input', 'session', '');
  protected readonly direction = this.persistence.signal<CsvSqlDirection>('csv-sql', 'direction', 'local', 'csv-to-sql');
  protected readonly tableName = this.persistence.signal('csv-sql', 'tableName', 'local', 'table');
  protected readonly paneRatio = this.persistence.signal('csv-sql', 'paneRatio', 'local', 0.5);

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<CsvSqlResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<CsvSqlResult | null>(() =>
    this.usesWorker() ? null : convertCsvSql(this.input(), this.direction(), this.tableName()),
  );

  protected readonly result = computed<CsvSqlResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  /** Save follows the output's format: INSERT statements save as `.sql`, SQL → CSV as `.csv`. */
  protected readonly saveExtension = computed(() => (this.direction() === 'sql-to-csv' ? '.csv' : '.sql'));
  protected readonly saveMimeType = computed(() =>
    this.direction() === 'sql-to-csv' ? 'text/csv;charset=utf-8' : 'application/sql',
  );

  constructor() {
    // A dropped .csv/.tsv hand-off lands in `input`; make sure it's read as CSV, not as INSERTs or JSON.
    if (inject(TextInputHandoffService).has('csv-sql')) this.direction.set('csv-to-sql');

    effect((onCleanup) => {
      const input = this.input();
      const direction = this.direction();
      const tableName = this.tableName();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: CsvSqlPayload = { input, direction, tableName };
      const job = this.workerClient.run<CsvSqlPayload, CsvSqlResult>(
        () => new Worker(new URL('./csv-sql.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onTableNameChange(event: Event): void {
    this.tableName.set((event.target as HTMLInputElement).value);
  }

  protected setDirection(direction: CsvSqlDirection): void {
    this.direction.set(direction);
  }

  protected onRatioChange(ratio: number): void {
    this.paneRatio.set(ratio);
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(output: string): void {
    void navigator.clipboard.writeText(output);
  }
}
