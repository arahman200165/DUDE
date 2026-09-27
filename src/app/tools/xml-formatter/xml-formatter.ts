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
import { XmlFormatResult, XmlIndent, XmlMode, processXml } from './xml-format';
import { XmlFormatPayload } from './xml-format-payload';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-xml-formatter',
  imports: [ToolShell, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './xml-formatter.html',
})
export class XmlFormatter {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('xml-formatter', 'input', 'session', '');
  protected readonly mode = this.persistence.signal<XmlMode>('xml-formatter', 'mode', 'local', 'format');
  protected readonly indent = this.persistence.signal<XmlIndent>('xml-formatter', 'indent', 'local', 2);

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<XmlFormatResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<XmlFormatResult | null>(() =>
    this.usesWorker() ? null : processXml(this.input(), this.mode(), this.indent()),
  );

  protected readonly result = computed<XmlFormatResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const input = this.input();
      const mode = this.mode();
      const indent = this.indent();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: XmlFormatPayload = { input, mode, indent };
      const job = this.workerClient.run<XmlFormatPayload, XmlFormatResult>(
        () => new Worker(new URL('./xml-format.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMode(mode: XmlMode): void {
    this.mode.set(mode);
  }

  protected onIndentChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.indent.set(value === 'tab' ? 'tab' : (Number(value) as XmlIndent));
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(output: string): void {
    void navigator.clipboard.writeText(output);
  }
}
