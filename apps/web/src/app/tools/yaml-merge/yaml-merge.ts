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
import { mergeYaml, YamlMergeResult } from "@dude/tool-engine/tools/yaml-merge/yaml-merge-transform";
import { YamlMergePayload } from "@dude/tool-engine/tools/yaml-merge/yaml-merge-payload";

/** Combined input length above which merging runs in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-yaml-merge',
  imports: [ToolShell, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './yaml-merge.html',
})
export class YamlMerge {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly baseInput = this.persistence.signal('yaml-merge', 'baseInput', 'session', '');
  protected readonly overlayInput = this.persistence.signal('yaml-merge', 'overlayInput', 'session', '');

  protected readonly usesWorker = computed(() => this.baseInput().length + this.overlayInput().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<YamlMergeResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<YamlMergeResult | null>(() =>
    this.usesWorker() ? null : mergeYaml(this.baseInput(), this.overlayInput()),
  );

  protected readonly result = computed<YamlMergeResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const baseInput = this.baseInput();
      const overlayInput = this.overlayInput();

      if (baseInput.length + overlayInput.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: YamlMergePayload = { baseInput, overlayInput };
      const job = this.workerClient.run<YamlMergePayload, YamlMergeResult>(
        () => new Worker(new URL('./yaml-merge.worker', import.meta.url), { type: 'module' }),
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

  protected clear(): void {
    this.baseInput.set('');
    this.overlayInput.set('');
  }

  protected copy(output: string): void {
    void navigator.clipboard.writeText(output);
  }
}
