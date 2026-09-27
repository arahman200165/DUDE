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
import { evaluateQuery, QueryLanguage, QueryResult } from './json-query-eval';
import { JsonQueryPayload } from './json-query-payload';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-json-query',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './json-query.html',
})
export class JsonQuery {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly jsonInput = this.persistence.signal('json-query', 'jsonInput', 'session', '');
  protected readonly query = this.persistence.signal('json-query', 'query', 'local', '');
  protected readonly language = this.persistence.signal<QueryLanguage>('json-query', 'language', 'local', 'jsonpath');
  protected readonly paneRatio = this.persistence.signal('json-query', 'paneRatio', 'local', 0.5);

  protected readonly usesWorker = computed(() => this.jsonInput().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<QueryResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<QueryResult | null>(() =>
    this.usesWorker() ? null : evaluateQuery(this.jsonInput(), this.query(), this.language()),
  );

  protected readonly result = computed<QueryResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const jsonInput = this.jsonInput();
      const query = this.query();
      const language = this.language();

      if (jsonInput.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: JsonQueryPayload = { jsonInput, query, language };
      const job = this.workerClient.run<JsonQueryPayload, QueryResult>(
        () => new Worker(new URL('./json-query-eval.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onJsonInputChange(event: Event): void {
    this.jsonInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onQueryChange(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected setLanguage(language: QueryLanguage): void {
    this.language.set(language);
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
