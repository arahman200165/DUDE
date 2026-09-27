import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { DiffLineType, DiffResult } from './text-diff';
import { TextDiffPayload } from './text-diff-payload';

const LINE_CLASSES: Record<DiffLineType, string> = {
  add: 'bg-success/10 text-success',
  remove: 'bg-error/10 text-error',
  equal: 'text-text-muted',
};

const LINE_PREFIX: Record<DiffLineType, string> = {
  add: '+ ',
  remove: '- ',
  equal: '  ',
};

@Component({
  selector: 'app-diff',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './diff.html',
})
export class Diff implements OnDestroy {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly left = this.persistence.signal('diff', 'left', 'session', '');
  protected readonly right = this.persistence.signal('diff', 'right', 'session', '');
  protected readonly paneRatio = this.persistence.signal('diff', 'paneRatio', 'local', 0.5);

  protected readonly job = signal<WorkerJob<DiffResult> | null>(null);

  protected readonly summaryText = computed(() => {
    const result = this.job()?.result();
    if (!result) return null;
    return `+${result.summary.added} / -${result.summary.removed} / ${result.summary.unchanged} unchanged`;
  });

  protected onLeftInput(event: Event): void {
    this.left.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRightInput(event: Event): void {
    this.right.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRatioChange(ratio: number): void {
    this.paneRatio.set(ratio);
  }

  protected run(): void {
    this.job()?.cancel();

    const payload: TextDiffPayload = { left: this.left(), right: this.right() };
    this.job.set(
      this.workerClient.run<TextDiffPayload, DiffResult>(
        () => new Worker(new URL('./text-diff.worker', import.meta.url), { type: 'module' }),
        payload,
      ),
    );
  }

  protected cancel(): void {
    this.job()?.cancel();
  }

  protected clear(): void {
    this.job()?.cancel();
    this.left.set('');
    this.right.set('');
    this.job.set(null);
  }

  protected lineClasses(type: DiffLineType): string {
    return LINE_CLASSES[type];
  }

  protected linePrefix(type: DiffLineType): string {
    return LINE_PREFIX[type];
  }

  ngOnDestroy(): void {
    this.job()?.cancel();
  }
}
