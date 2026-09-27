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
import { SchemaDraftMode, SchemaValidateResult, detectDraft, validateJsonSchema } from './schema-validate';
import { SchemaValidatePayload } from './schema-validate-payload';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

const DEFAULT_SCHEMA = JSON.stringify(
  { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  null,
  2,
);
const DEFAULT_INSTANCE = JSON.stringify({ name: 'Ada' }, null, 2);

@Component({
  selector: 'app-json-schema-validator',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './json-schema-validator.html',
})
export class JsonSchemaValidator {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly schema = this.persistence.signal('json-schema-validator', 'schema', 'session', DEFAULT_SCHEMA);
  protected readonly instance = this.persistence.signal(
    'json-schema-validator',
    'instance',
    'session',
    DEFAULT_INSTANCE,
  );
  protected readonly draftMode = this.persistence.signal<SchemaDraftMode>(
    'json-schema-validator',
    'draftMode',
    'local',
    'auto',
  );
  protected readonly paneRatio = this.persistence.signal('json-schema-validator', 'paneRatio', 'local', 0.5);

  protected readonly usesWorker = computed(() => this.schema().length + this.instance().length > WORKER_THRESHOLD);

  protected readonly detectedDraft = computed(() => {
    try {
      return detectDraft(JSON.parse(this.schema()));
    } catch {
      return null;
    }
  });

  private readonly jobSignal = signal<WorkerJob<SchemaValidateResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<SchemaValidateResult | null>(() =>
    this.usesWorker() ? null : validateJsonSchema(this.schema(), this.instance(), this.draftMode()),
  );

  protected readonly result = computed<SchemaValidateResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const schema = this.schema();
      const instance = this.instance();
      const draftMode = this.draftMode();

      if (schema.length + instance.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: SchemaValidatePayload = { schemaText: schema, instanceText: instance, draftMode };
      const job = this.workerClient.run<SchemaValidatePayload, SchemaValidateResult>(
        () => new Worker(new URL('./schema-validate.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onSchemaChange(event: Event): void {
    this.schema.set((event.target as HTMLTextAreaElement).value);
  }

  protected onInstanceChange(event: Event): void {
    this.instance.set((event.target as HTMLTextAreaElement).value);
  }

  protected setDraftMode(mode: SchemaDraftMode): void {
    this.draftMode.set(mode);
  }

  protected onRatioChange(ratio: number): void {
    this.paneRatio.set(ratio);
  }

  protected clear(): void {
    this.schema.set('');
    this.instance.set('');
  }

  protected copyErrors(result: SchemaValidateResult): void {
    if (!result.ok && result.stage === 'validation') {
      void navigator.clipboard.writeText(JSON.stringify(result.errors, null, 2));
    }
  }
}
