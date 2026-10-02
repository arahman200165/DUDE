import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { cleanCsv, CsvCleanOptions, CsvCleanResult } from "@dude/tool-engine/tools/csv-cleaner/csv-clean";
import { CsvCleanPayload } from "@dude/tool-engine/tools/csv-cleaner/csv-clean-payload";

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-csv-cleaner',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './csv-cleaner.html',
})
export class CsvCleaner {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('csv-cleaner', 'input', 'session', '');
  protected readonly trimCells = this.persistence.signal('csv-cleaner', 'trimCells', 'local', true);
  protected readonly dropEmptyRows = this.persistence.signal('csv-cleaner', 'dropEmptyRows', 'local', true);
  protected readonly paneRatio = this.persistence.signal('csv-cleaner', 'paneRatio', 'local', 0.5);

  private readonly options = computed<CsvCleanOptions>(() => ({
    trimCells: this.trimCells(),
    dropEmptyRows: this.dropEmptyRows(),
  }));

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<CsvCleanResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<CsvCleanResult | null>(() =>
    this.usesWorker() ? null : cleanCsv(this.input(), this.options()),
  );

  protected readonly result = computed<CsvCleanResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const input = this.input();
      const options = this.options();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: CsvCleanPayload = { input, options };
      const job = this.workerClient.run<CsvCleanPayload, CsvCleanResult>(
        () => new Worker(new URL('./csv-clean.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected toggleTrimCells(): void {
    this.trimCells.set(!this.trimCells());
  }

  protected toggleDropEmptyRows(): void {
    this.dropEmptyRows.set(!this.dropEmptyRows());
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
