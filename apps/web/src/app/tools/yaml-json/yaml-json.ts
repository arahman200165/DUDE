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
import { convertYaml, JsonIndent, YamlConvertResult, YamlDirection } from "@dude/tool-engine/tools/yaml-json/yaml-convert";
import { YamlConvertPayload } from "@dude/tool-engine/tools/yaml-json/yaml-convert-payload";
import { TextInputHandoffService } from '../../core/text-file-input/text-input-handoff.service';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-yaml-json',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './yaml-json.html',
})
export class YamlJson {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('yaml-json', 'input', 'session', '');
  protected readonly direction = this.persistence.signal<YamlDirection>('yaml-json', 'direction', 'local', 'yaml-to-json');
  protected readonly indent = this.persistence.signal<JsonIndent>('yaml-json', 'indent', 'local', 2);
  protected readonly paneRatio = this.persistence.signal('yaml-json', 'paneRatio', 'local', 0.5);

  protected readonly outputExtension = computed(() => (this.direction() === 'yaml-to-json' ? '.json' : '.yaml'));
  protected readonly outputMimeType = computed(() =>
    this.direction() === 'yaml-to-json' ? 'application/json;charset=utf-8' : 'application/yaml;charset=utf-8',
  );

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<YamlConvertResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<YamlConvertResult | null>(() =>
    this.usesWorker() ? null : convertYaml(this.input(), this.direction(), this.indent()),
  );

  protected readonly result = computed<YamlConvertResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    // A dropped/pasted YAML hand-off lands in `input`; make sure it's read as YAML, not the other direction.
    if (inject(TextInputHandoffService).has('yaml-json')) this.direction.set('yaml-to-json');

    effect((onCleanup) => {
      const input = this.input();
      const direction = this.direction();
      const indent = this.indent();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: YamlConvertPayload = { input, direction, indent };
      const job = this.workerClient.run<YamlConvertPayload, YamlConvertResult>(
        () => new Worker(new URL('./yaml-convert.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setDirection(direction: YamlDirection): void {
    this.direction.set(direction);
  }

  protected swap(): void {
    const current = this.result();
    if (current?.ok) this.input.set(current.output);
    this.direction.set(this.direction() === 'yaml-to-json' ? 'json-to-yaml' : 'yaml-to-json');
  }

  protected onIndentChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.indent.set(value === 'tab' ? 'tab' : (Number(value) as JsonIndent));
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
