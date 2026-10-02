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
import { flattenJson, FlattenDirection, FlattenResult } from "@dude/tool-engine/tools/json-flatten/json-flatten-transform";
import { JsonFlattenPayload } from "@dude/tool-engine/tools/json-flatten/json-flatten-payload";

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-json-flatten',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './json-flatten.html',
})
export class JsonFlatten {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('json-flatten', 'input', 'session', '');
  protected readonly direction = this.persistence.signal<FlattenDirection>('json-flatten', 'direction', 'local', 'flatten');
  protected readonly paneRatio = this.persistence.signal('json-flatten', 'paneRatio', 'local', 0.5);

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<FlattenResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<FlattenResult | null>(() =>
    this.usesWorker() ? null : flattenJson(this.input(), this.direction()),
  );

  protected readonly result = computed<FlattenResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const input = this.input();
      const direction = this.direction();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: JsonFlattenPayload = { input, direction };
      const job = this.workerClient.run<JsonFlattenPayload, FlattenResult>(
        () => new Worker(new URL('./json-flatten.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setDirection(direction: FlattenDirection): void {
    this.direction.set(direction);
  }

  protected swap(): void {
    const current = this.result();
    if (current?.ok) this.input.set(current.output);
    this.direction.set(this.direction() === 'flatten' ? 'unflatten' : 'flatten');
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
