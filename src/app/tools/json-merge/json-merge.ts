import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { mergeJson, JsonMergeResult, JsonMergeStrategy } from './json-merge-transform';
import { JsonMergePayload } from './json-merge-payload';

/** Combined input length above which merging runs in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-json-merge',
  imports: [ToolShell, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './json-merge.html',
})
export class JsonMerge {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly baseInput = this.persistence.signal('json-merge', 'baseInput', 'session', '');
  protected readonly overlayInput = this.persistence.signal('json-merge', 'overlayInput', 'session', '');
  protected readonly strategy = this.persistence.signal<JsonMergeStrategy>('json-merge', 'strategy', 'local', 'deep');

  protected readonly usesWorker = computed(() => this.baseInput().length + this.overlayInput().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<JsonMergeResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<JsonMergeResult | null>(() =>
    this.usesWorker() ? null : mergeJson(this.baseInput(), this.overlayInput(), this.strategy()),
  );

  protected readonly result = computed<JsonMergeResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const baseInput = this.baseInput();
      const overlayInput = this.overlayInput();
      const strategy = this.strategy();

      if (baseInput.length + overlayInput.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: JsonMergePayload = { baseInput, overlayInput, strategy };
      const job = this.workerClient.run<JsonMergePayload, JsonMergeResult>(
        () => new Worker(new URL('./json-merge.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onBaseInputChange(event: Event): void {
    this.baseInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onOverlayInputChange(event: Event): void {
    this.overlayInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected setStrategy(strategy: JsonMergeStrategy): void {
    this.strategy.set(strategy);
  }

  protected clear(): void {
    this.baseInput.set('');
    this.overlayInput.set('');
  }

  protected copy(output: string): void {
    void navigator.clipboard.writeText(output);
  }
}
