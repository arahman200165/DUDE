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
import { convertIni, IniConvertResult, IniDirection } from './ini-convert';
import { IniConvertPayload } from './ini-convert-payload';
import { TextInputHandoffService } from '../../core/text-file-input/text-input-handoff.service';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-ini-formatter',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './ini-formatter.html',
})
export class IniFormatter {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('ini-formatter', 'input', 'session', '');
  protected readonly direction = this.persistence.signal<IniDirection>('ini-formatter', 'direction', 'local', 'ini-to-json');
  protected readonly paneRatio = this.persistence.signal('ini-formatter', 'paneRatio', 'local', 0.5);

  protected readonly outputExtension = computed(() => (this.direction() === 'ini-to-json' ? '.json' : '.ini'));
  protected readonly outputMimeType = computed(() =>
    this.direction() === 'ini-to-json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
  );

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<IniConvertResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<IniConvertResult | null>(() =>
    this.usesWorker() ? null : convertIni(this.input(), this.direction()),
  );

  protected readonly result = computed<IniConvertResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    // A dropped/pasted .ini hand-off lands in `input`; make sure it's read as .ini, not the other direction.
    if (inject(TextInputHandoffService).has('ini-formatter')) this.direction.set('ini-to-json');

    effect((onCleanup) => {
      const input = this.input();
      const direction = this.direction();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: IniConvertPayload = { input, direction };
      const job = this.workerClient.run<IniConvertPayload, IniConvertResult>(
        () => new Worker(new URL('./ini-convert.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setDirection(direction: IniDirection): void {
    this.direction.set(direction);
  }

  protected swap(): void {
    const current = this.result();
    if (current?.ok) this.input.set(current.output);
    this.direction.set(this.direction() === 'ini-to-json' ? 'json-to-ini' : 'ini-to-json');
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
