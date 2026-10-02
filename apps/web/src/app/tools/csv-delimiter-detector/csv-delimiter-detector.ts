import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { detectCsvDelimiter, CsvDelimiterResult } from "@dude/tool-engine/tools/csv-delimiter-detector/csv-delimiter-detect";
import { CsvDelimiterDetectPayload } from "@dude/tool-engine/tools/csv-delimiter-detector/csv-delimiter-detect-payload";

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-csv-delimiter-detector',
  imports: [ToolShell, SplitPane, DataTable, SimpleColumnsPipe, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './csv-delimiter-detector.html',
})
export class CsvDelimiterDetector {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('csv-delimiter-detector', 'input', 'session', '');
  protected readonly paneRatio = this.persistence.signal('csv-delimiter-detector', 'paneRatio', 'local', 0.5);

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<CsvDelimiterResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<CsvDelimiterResult | null>(() =>
    this.usesWorker() ? null : detectCsvDelimiter(this.input()),
  );

  protected readonly result = computed<CsvDelimiterResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const input = this.input();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: CsvDelimiterDetectPayload = { input };
      const job = this.workerClient.run<CsvDelimiterDetectPayload, CsvDelimiterResult>(
        () => new Worker(new URL('./csv-delimiter-detect.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRatioChange(ratio: number): void {
    this.paneRatio.set(ratio);
  }

  protected clear(): void {
    this.input.set('');
  }
}
