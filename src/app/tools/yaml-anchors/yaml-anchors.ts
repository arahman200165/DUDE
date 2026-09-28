import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { findYamlAnchors, YamlAnchorsResult } from './yaml-anchors-transform';
import { YamlAnchorsPayload } from './yaml-anchors-payload';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-yaml-anchors',
  imports: [ToolShell, SplitPane, WorkbenchTable, SimpleColumnsPipe, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './yaml-anchors.html',
})
export class YamlAnchors {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('yaml-anchors', 'input', 'session', '');
  protected readonly paneRatio = this.persistence.signal('yaml-anchors', 'paneRatio', 'local', 0.5);

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<YamlAnchorsResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<YamlAnchorsResult | null>(() =>
    this.usesWorker() ? null : findYamlAnchors(this.input()),
  );

  protected readonly result = computed<YamlAnchorsResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  protected readonly rows = computed<readonly (readonly string[])[]>(() => {
    const current = this.result();
    if (!current?.ok) return [];
    return current.anchors.map((anchor) => [anchor.anchor, anchor.definitionPaths.join(', '), anchor.aliasPaths.join(', ') || '(unused)']);
  });

  constructor() {
    effect((onCleanup) => {
      const input = this.input();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: YamlAnchorsPayload = { input };
      const job = this.workerClient.run<YamlAnchorsPayload, YamlAnchorsResult>(
        () => new Worker(new URL('./yaml-anchors.worker', import.meta.url), { type: 'module' }),
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
