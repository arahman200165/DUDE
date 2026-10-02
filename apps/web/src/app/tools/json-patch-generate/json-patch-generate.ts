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
import { generateJsonPatch, JsonPatchGenerateResult } from "@dude/tool-engine/tools/json-patch-generate/json-patch-generate-transform";
import { JsonPatchGeneratePayload } from "@dude/tool-engine/tools/json-patch-generate/json-patch-generate-payload";

/** Combined input length above which the diff runs in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-json-patch-generate',
  imports: [ToolShell, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './json-patch-generate.html',
})
export class JsonPatchGenerate {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly beforeInput = this.persistence.signal('json-patch-generate', 'beforeInput', 'session', '');
  protected readonly afterInput = this.persistence.signal('json-patch-generate', 'afterInput', 'session', '');

  protected readonly usesWorker = computed(() => this.beforeInput().length + this.afterInput().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<JsonPatchGenerateResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<JsonPatchGenerateResult | null>(() =>
    this.usesWorker() ? null : generateJsonPatch(this.beforeInput(), this.afterInput()),
  );

  protected readonly result = computed<JsonPatchGenerateResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const beforeInput = this.beforeInput();
      const afterInput = this.afterInput();

      if (beforeInput.length + afterInput.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: JsonPatchGeneratePayload = { beforeInput, afterInput };
      const job = this.workerClient.run<JsonPatchGeneratePayload, JsonPatchGenerateResult>(
        () => new Worker(new URL('./json-patch-generate.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onBeforeInputChange(event: Event): void {
    this.beforeInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onAfterInputChange(event: Event): void {
    this.afterInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.beforeInput.set('');
    this.afterInput.set('');
  }

  protected copy(output: string): void {
    void navigator.clipboard.writeText(output);
  }
}
