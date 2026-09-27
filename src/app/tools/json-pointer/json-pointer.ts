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
import { resolveJsonPointer, JsonPointerResult } from './json-pointer-transform';
import { JsonPointerPayload } from './json-pointer-payload';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-json-pointer',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './json-pointer.html',
})
export class JsonPointer {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly jsonInput = this.persistence.signal('json-pointer', 'jsonInput', 'session', '');
  protected readonly pointer = this.persistence.signal('json-pointer', 'pointer', 'local', '');
  protected readonly paneRatio = this.persistence.signal('json-pointer', 'paneRatio', 'local', 0.5);

  protected readonly usesWorker = computed(() => this.jsonInput().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<JsonPointerResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<JsonPointerResult | null>(() =>
    this.usesWorker() ? null : resolveJsonPointer(this.jsonInput(), this.pointer()),
  );

  protected readonly result = computed<JsonPointerResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const jsonInput = this.jsonInput();
      const pointer = this.pointer();

      if (jsonInput.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: JsonPointerPayload = { jsonInput, pointer };
      const job = this.workerClient.run<JsonPointerPayload, JsonPointerResult>(
        () => new Worker(new URL('./json-pointer.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onJsonInputChange(event: Event): void {
    this.jsonInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onPointerChange(event: Event): void {
    this.pointer.set((event.target as HTMLInputElement).value);
  }

  protected onRatioChange(ratio: number): void {
    this.paneRatio.set(ratio);
  }

  protected clear(): void {
    this.jsonInput.set('');
  }

  protected copy(output: string): void {
    void navigator.clipboard.writeText(output);
  }
}
