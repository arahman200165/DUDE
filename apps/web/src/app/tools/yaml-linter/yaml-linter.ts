import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { lintYaml, YamlLintResult } from "@dude/tool-engine/tools/yaml-linter/yaml-lint";
import { YamlLintPayload } from "@dude/tool-engine/tools/yaml-linter/yaml-lint-payload";

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-yaml-linter',
  imports: [ToolShell, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './yaml-linter.html',
})
export class YamlLinter {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('yaml-linter', 'input', 'session', '');

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<YamlLintResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<YamlLintResult | null>(() => (this.usesWorker() ? null : lintYaml(this.input())));

  protected readonly result = computed<YamlLintResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const input = this.input();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: YamlLintPayload = { input };
      const job = this.workerClient.run<YamlLintPayload, YamlLintResult>(
        () => new Worker(new URL('./yaml-lint.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.input.set('');
  }
}
