import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { TextInputHandoffService } from '../../core/text-file-input/text-input-handoff.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { convertCsv, CsvConvertResult, CsvDelimiter, CsvDirection, CsvParseResult, parseCsv } from './csv-convert';
import { CsvConvertPayload } from './csv-convert-payload';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

type OutputView = 'table' | 'json';

@Component({
  selector: 'app-csv-viewer',
  imports: [ToolShell, SplitPane, DataTable, SimpleColumnsPipe, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './csv-viewer.html',
})
export class CsvViewer {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('csv-viewer', 'input', 'session', '');
  protected readonly direction = this.persistence.signal<CsvDirection>('csv-viewer', 'direction', 'local', 'csv-to-json');
  protected readonly delimiter = this.persistence.signal<CsvDelimiter>('csv-viewer', 'delimiter', 'local', ',');
  protected readonly hasHeaderRow = this.persistence.signal('csv-viewer', 'hasHeaderRow', 'local', true);
  protected readonly outputView = this.persistence.signal<OutputView>('csv-viewer', 'outputView', 'local', 'table');
  protected readonly paneRatio = this.persistence.signal('csv-viewer', 'paneRatio', 'local', 0.5);

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<CsvConvertResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<CsvConvertResult | null>(() =>
    this.usesWorker() ? null : convertCsv(this.input(), this.direction(), this.delimiter(), this.hasHeaderRow()),
  );

  protected readonly result = computed<CsvConvertResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  protected readonly showTableToggle = computed(() => this.direction() === 'csv-to-json' && !this.usesWorker());

  protected readonly table = computed<CsvParseResult | null>(() =>
    this.showTableToggle() ? parseCsv(this.input(), this.delimiter(), this.hasHeaderRow()) : null,
  );

  /** Save follows the output's format, not the input's: CSV → JSON saves `.json`, JSON → CSV `.csv`. */
  protected readonly saveExtension = computed(() => (this.direction() === 'csv-to-json' ? '.json' : '.csv'));
  protected readonly saveMimeType = computed(() =>
    this.direction() === 'csv-to-json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
  );

  constructor() {
    // A dropped .csv hand-off lands in `input`; make sure it's read as CSV, not as JSON.
    if (inject(TextInputHandoffService).has('csv-viewer')) this.direction.set('csv-to-json');

    effect((onCleanup) => {
      const input = this.input();
      const direction = this.direction();
      const delimiter = this.delimiter();
      const hasHeaderRow = this.hasHeaderRow();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: CsvConvertPayload = { input, direction, delimiter, hasHeaderRow };
      const job = this.workerClient.run<CsvConvertPayload, CsvConvertResult>(
        () => new Worker(new URL('./csv-convert.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setDirection(direction: CsvDirection): void {
    this.direction.set(direction);
  }

  protected onDelimiterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.delimiter.set(value === '\\t' ? '\t' : (value as CsvDelimiter));
  }

  protected toggleHeaderRow(): void {
    this.hasHeaderRow.set(!this.hasHeaderRow());
  }

  protected setOutputView(view: OutputView): void {
    this.outputView.set(view);
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
