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
import { convertXmlCsv, XmlCsvDirection, XmlCsvResult } from './xml-csv-transform';
import { XmlCsvPayload } from './xml-csv-payload';
import { TextInputHandoffService } from '../../core/text-file-input/text-input-handoff.service';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-xml-csv',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './xml-csv.html',
})
export class XmlCsv {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('xml-csv', 'input', 'session', '');
  protected readonly direction = this.persistence.signal<XmlCsvDirection>('xml-csv', 'direction', 'local', 'xml-to-csv');
  protected readonly recordElement = this.persistence.signal('xml-csv', 'recordElement', 'local', '');
  protected readonly paneRatio = this.persistence.signal('xml-csv', 'paneRatio', 'local', 0.5);

  protected readonly outputExtension = computed(() => (this.direction() === 'xml-to-csv' ? '.csv' : '.xml'));
  protected readonly outputMimeType = computed(() =>
    this.direction() === 'xml-to-csv' ? 'text/csv;charset=utf-8' : 'application/xml;charset=utf-8',
  );

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<XmlCsvResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<XmlCsvResult | null>(() =>
    this.usesWorker() ? null : convertXmlCsv(this.input(), this.direction(), this.recordElement()),
  );

  protected readonly result = computed<XmlCsvResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    // A dropped/pasted XML hand-off lands in `input`; make sure it's read as XML, not the other direction.
    if (inject(TextInputHandoffService).has('xml-csv')) this.direction.set('xml-to-csv');

    effect((onCleanup) => {
      const input = this.input();
      const direction = this.direction();
      const recordElement = this.recordElement();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: XmlCsvPayload = { input, direction, recordElement };
      const job = this.workerClient.run<XmlCsvPayload, XmlCsvResult>(
        () => new Worker(new URL('./xml-csv.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setDirection(direction: XmlCsvDirection): void {
    this.direction.set(direction);
  }

  protected onRecordElementChange(event: Event): void {
    this.recordElement.set((event.target as HTMLInputElement).value);
  }

  protected swap(): void {
    const current = this.result();
    if (current?.ok) this.input.set(current.output);
    this.direction.set(this.direction() === 'xml-to-csv' ? 'csv-to-xml' : 'xml-to-csv');
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
