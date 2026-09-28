import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { joinCsv, CsvJoinResult, CsvJoinType } from './csv-join-transform';
import { CsvJoinPayload } from './csv-join-payload';

/** Combined input length above which the join runs in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

@Component({
  selector: 'app-csv-join',
  imports: [ToolShell, DataTable, SimpleColumnsPipe, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './csv-join.html',
})
export class CsvJoin {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly leftInput = this.persistence.signal('csv-join', 'leftInput', 'session', '');
  protected readonly rightInput = this.persistence.signal('csv-join', 'rightInput', 'session', '');
  protected readonly leftKey = this.persistence.signal('csv-join', 'leftKey', 'session', '');
  protected readonly rightKey = this.persistence.signal('csv-join', 'rightKey', 'session', '');
  protected readonly joinType = this.persistence.signal<CsvJoinType>('csv-join', 'joinType', 'local', 'inner');

  protected readonly usesWorker = computed(() => this.leftInput().length + this.rightInput().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<CsvJoinResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<CsvJoinResult | null>(() =>
    this.usesWorker() ? null : joinCsv(this.leftInput(), this.rightInput(), this.leftKey(), this.rightKey(), this.joinType()),
  );

  protected readonly result = computed<CsvJoinResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    effect((onCleanup) => {
      const leftInput = this.leftInput();
      const rightInput = this.rightInput();
      const leftKey = this.leftKey();
      const rightKey = this.rightKey();
      const joinType = this.joinType();

      if (leftInput.length + rightInput.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: CsvJoinPayload = { leftInput, rightInput, leftKey, rightKey, joinType };
      const job = this.workerClient.run<CsvJoinPayload, CsvJoinResult>(
        () => new Worker(new URL('./csv-join.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onLeftInputChange(event: Event): void {
    this.leftInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRightInputChange(event: Event): void {
    this.rightInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onLeftKeyChange(event: Event): void {
    this.leftKey.set((event.target as HTMLInputElement).value);
  }

  protected onRightKeyChange(event: Event): void {
    this.rightKey.set((event.target as HTMLInputElement).value);
  }

  protected setJoinType(joinType: CsvJoinType): void {
    this.joinType.set(joinType);
  }

  protected clear(): void {
    this.leftInput.set('');
    this.rightInput.set('');
  }
}
