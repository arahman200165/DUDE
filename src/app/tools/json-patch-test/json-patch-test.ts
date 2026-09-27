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
import { testJsonPatch, JsonPatchTestResult } from './json-patch-test-transform';
import { JsonPatchTestPayload } from './json-patch-test-payload';

/** Combined input length above which applying the patch runs in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-json-patch-test',
  imports: [ToolShell, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './json-patch-test.html',
})
export class JsonPatchTest {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly documentInput = this.persistence.signal('json-patch-test', 'documentInput', 'session', '');
  protected readonly patchInput = this.persistence.signal('json-patch-test', 'patchInput', 'session', '');

  protected readonly usesWorker = computed(() => this.documentInput().length + this.patchInput().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<JsonPatchTestResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<JsonPatchTestResult | null>(() =>
    this.usesWorker() ? null : testJsonPatch(this.documentInput(), this.patchInput()),
  );

  protected readonly result = computed<JsonPatchTestResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const documentInput = this.documentInput();
      const patchInput = this.patchInput();

      if (documentInput.length + patchInput.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: JsonPatchTestPayload = { documentInput, patchInput };
      const job = this.workerClient.run<JsonPatchTestPayload, JsonPatchTestResult>(
        () => new Worker(new URL('./json-patch-test.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onDocumentInputChange(event: Event): void {
    this.documentInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onPatchInputChange(event: Event): void {
    this.patchInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.documentInput.set('');
    this.patchInput.set('');
  }

  protected copy(output: string): void {
    void navigator.clipboard.writeText(output);
  }
}
