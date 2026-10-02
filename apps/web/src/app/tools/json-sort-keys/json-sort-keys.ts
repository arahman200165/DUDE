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
import { sortJsonKeys, JsonSortKeysResult, SortOrder } from "@dude/tool-engine/tools/json-sort-keys/json-sort-keys-transform";
import { JsonSortKeysPayload } from "@dude/tool-engine/tools/json-sort-keys/json-sort-keys-payload";

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-json-sort-keys',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './json-sort-keys.html',
})
export class JsonSortKeys {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('json-sort-keys', 'input', 'session', '');
  protected readonly recursive = this.persistence.signal('json-sort-keys', 'recursive', 'local', true);
  protected readonly order = this.persistence.signal<SortOrder>('json-sort-keys', 'order', 'local', 'asc');
  protected readonly paneRatio = this.persistence.signal('json-sort-keys', 'paneRatio', 'local', 0.5);

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<JsonSortKeysResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<JsonSortKeysResult | null>(() =>
    this.usesWorker() ? null : sortJsonKeys(this.input(), this.recursive(), this.order()),
  );

  protected readonly result = computed<JsonSortKeysResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const input = this.input();
      const recursive = this.recursive();
      const order = this.order();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: JsonSortKeysPayload = { input, recursive, order };
      const job = this.workerClient.run<JsonSortKeysPayload, JsonSortKeysResult>(
        () => new Worker(new URL('./json-sort-keys.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected toggleRecursive(): void {
    this.recursive.set(!this.recursive());
  }

  protected setOrder(order: SortOrder): void {
    this.order.set(order);
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
