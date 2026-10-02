import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { evaluateYamlPath, YamlPathLanguage, YamlPathResult } from "@dude/tool-engine/tools/yaml-path/yaml-path-eval";
import { YamlPathPayload } from "@dude/tool-engine/tools/yaml-path/yaml-path-payload";

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-yaml-path',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './yaml-path.html',
})
export class YamlPath {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly yamlInput = this.persistence.signal('yaml-path', 'yamlInput', 'session', '');
  protected readonly query = this.persistence.signal('yaml-path', 'query', 'local', '');
  protected readonly language = this.persistence.signal<YamlPathLanguage>('yaml-path', 'language', 'local', 'jsonpath');
  protected readonly paneRatio = this.persistence.signal('yaml-path', 'paneRatio', 'local', 0.5);

  protected readonly usesWorker = computed(() => this.yamlInput().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<YamlPathResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<YamlPathResult | null>(() =>
    this.usesWorker() ? null : evaluateYamlPath(this.yamlInput(), this.query(), this.language()),
  );

  protected readonly result = computed<YamlPathResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const yamlInput = this.yamlInput();
      const query = this.query();
      const language = this.language();

      if (yamlInput.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: YamlPathPayload = { yamlInput, query, language };
      const job = this.workerClient.run<YamlPathPayload, YamlPathResult>(
        () => new Worker(new URL('./yaml-path-eval.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onYamlInputChange(event: Event): void {
    this.yamlInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onQueryChange(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected setLanguage(language: YamlPathLanguage): void {
    this.language.set(language);
  }

  protected onRatioChange(ratio: number): void {
    this.paneRatio.set(ratio);
  }

  protected clear(): void {
    this.yamlInput.set('');
  }

  protected copy(output: string): void {
    void navigator.clipboard.writeText(output);
  }
}
