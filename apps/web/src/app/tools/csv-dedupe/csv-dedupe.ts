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
import { dedupeCsv, CsvDedupeResult } from "@dude/tool-engine/tools/csv-dedupe/csv-dedupe-transform";
import { CsvDedupePayload } from "@dude/tool-engine/tools/csv-dedupe/csv-dedupe-payload";

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-csv-dedupe',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './csv-dedupe.html',
})
export class CsvDedupe {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('csv-dedupe', 'input', 'session', '');
  protected readonly keyColumnsInput = this.persistence.signal('csv-dedupe', 'keyColumnsInput', 'session', '');
  protected readonly paneRatio = this.persistence.signal('csv-dedupe', 'paneRatio', 'local', 0.5);

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<CsvDedupeResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<CsvDedupeResult | null>(() =>
    this.usesWorker() ? null : dedupeCsv(this.input(), this.keyColumnsInput()),
  );

  protected readonly result = computed<CsvDedupeResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const input = this.input();
      const keyColumnsInput = this.keyColumnsInput();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: CsvDedupePayload = { input, keyColumnsInput };
      const job = this.workerClient.run<CsvDedupePayload, CsvDedupeResult>(
        () => new Worker(new URL('./csv-dedupe.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onKeyColumnsChange(event: Event): void {
    this.keyColumnsInput.set((event.target as HTMLInputElement).value);
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
