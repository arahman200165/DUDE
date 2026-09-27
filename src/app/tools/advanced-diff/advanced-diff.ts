import { Component, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { DiffLineType } from '../diff/text-diff';
import { DiffSegmentType } from './char-word-diff';
import { DiffHunk, MergeDecision, buildHunks, buildMergedOutput } from './diff-hunks';
import { formatUnifiedDiff } from './unified-diff';
import { AdvancedDiffPayload, DiffGranularity, DiffMode } from './advanced-diff-payload';
import { AdvancedDiffResult } from './advanced-diff-result';
import { buildThreeWayMergeOutput, ThreeWayDecision, ThreeWayHunk } from './three-way-merge';
import { IgnoreOptions, NO_IGNORE_OPTIONS } from './diff-normalize';
import { SemanticDiffView } from './semantic-diff-view/semantic-diff-view';
import { detectMovedBlocks, MovedBlockAnnotation } from './moved-block-diff';
import { AdvancedDiffImagePayload } from './advanced-diff-image-payload';
import { AdvancedDiffImageResult } from './advanced-diff-image-result';
import { ImageDiffView } from './image-diff-view/image-diff-view';

export type DiffInputMode = 'paste' | 'file';
export type DiffViewMode = 'diff' | 'merge';
export type MergeMode = 'two-way' | 'three-way';

const LINE_CLASSES: Record<DiffLineType, string> = {
  add: 'bg-success/10 text-success',
  remove: 'bg-error/10 text-error',
  equal: 'text-text-muted',
};

const LINE_PREFIX: Record<DiffLineType, string> = { add: '+ ', remove: '- ', equal: '  ' };

const SEGMENT_CLASSES: Record<DiffSegmentType, string> = {
  add: 'bg-success/30 text-success',
  remove: 'bg-error/30 text-error line-through',
  equal: '',
};

@Component({
  selector: 'app-advanced-diff',
  imports: [ToolShell, SplitPane, BusyIndicator, ErrorPanel, FileDrop, SemanticDiffView, ImageDiffView, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './advanced-diff.html',
})
export class AdvancedDiff implements OnDestroy {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly left = this.persistence.signal('advanced-diff', 'left', 'session', '');
  protected readonly right = this.persistence.signal('advanced-diff', 'right', 'session', '');
  protected readonly inputMode = this.persistence.signal<DiffInputMode>('advanced-diff', 'inputMode', 'local', 'paste');
  protected readonly mode = this.persistence.signal<DiffMode>('advanced-diff', 'mode', 'local', 'text');
  protected readonly granularity = this.persistence.signal<DiffGranularity>(
    'advanced-diff',
    'granularity',
    'local',
    'line',
  );
  protected readonly viewMode = this.persistence.signal<DiffViewMode>('advanced-diff', 'viewMode', 'local', 'diff');
  protected readonly paneRatio = this.persistence.signal('advanced-diff', 'paneRatio', 'local', 0.5);
  protected readonly mergeMode = this.persistence.signal<MergeMode>('advanced-diff', 'mergeMode', 'local', 'two-way');
  protected readonly base = this.persistence.signal('advanced-diff', 'base', 'session', '');
  protected readonly ignoreOptions = this.persistence.signal<IgnoreOptions>(
    'advanced-diff',
    'ignoreOptions',
    'local',
    NO_IGNORE_OPTIONS,
  );

  // The left pane's Open file… button (paste mode only) -- the patch and merged-result saves are named after its file.
  protected readonly leftOpener = viewChild<OpenTextFile>('openLeft');

  protected readonly rejection = signal<string | null>(null);
  protected readonly job = signal<WorkerJob<AdvancedDiffResult> | null>(null);

  // In-memory only — merge decisions are keyed to a specific diff run and
  // shouldn't silently reapply to unrelated content after a reload.
  protected readonly mergeDecisions = signal<ReadonlyMap<number, MergeDecision>>(new Map());
  protected readonly threeWayDecisions = signal<ReadonlyMap<number, ThreeWayDecision>>(new Map());
  protected readonly activeHunk = signal(0);

  protected readonly detectMovedBlocksEnabled = this.persistence.signal('advanced-diff', 'detectMovedBlocks', 'local', false);

  // Images are never JSON-serializable and shouldn't round-trip through sessionStorage -- held
  // in-memory only, like FileDrop's own selected-file state.
  protected readonly leftImageFile = signal<File | null>(null);
  protected readonly rightImageFile = signal<File | null>(null);
  protected readonly imageThreshold = this.persistence.signal('advanced-diff', 'imageThreshold', 'local', 0.1);
  protected readonly imageJob = signal<WorkerJob<AdvancedDiffImageResult> | null>(null);

  protected readonly hunks = computed<readonly DiffHunk[]>(() => {
    const result = this.job()?.result();
    return result ? buildHunks(result.lineDiff.lines) : [];
  });

  protected readonly movedBlockAnnotations = computed<ReadonlyMap<number, MovedBlockAnnotation>>(() =>
    this.detectMovedBlocksEnabled() ? detectMovedBlocks(this.hunks()) : new Map(),
  );

  protected readonly mergedOutput = computed(() => {
    const result = this.job()?.result();
    return result ? buildMergedOutput(result.lineDiff.lines, this.hunks(), this.mergeDecisions()) : '';
  });

  protected readonly resolvedCount = computed(() => this.mergeDecisions().size);

  protected readonly threeWayHunks = computed<readonly ThreeWayHunk[]>(() => this.job()?.result()?.threeWayMerge?.hunks ?? []);
  protected readonly threeWayConflictHunks = computed(() =>
    this.threeWayHunks().filter((h) => !h.context && h.status === 'conflict'),
  );
  protected readonly threeWayMergedOutput = computed(() =>
    buildThreeWayMergeOutput(this.threeWayHunks(), this.threeWayDecisions()),
  );

  protected readonly unifiedDiffText = computed(() => {
    const result = this.job()?.result();
    if (!result) return '';
    return formatUnifiedDiff(result.lineDiff.lines, {
      leftHasTrailingNewline: this.left() === '' || this.left().endsWith('\n'),
      rightHasTrailingNewline: this.right() === '' || this.right().endsWith('\n'),
    });
  });

  protected setInputMode(mode: DiffInputMode): void {
    this.inputMode.set(mode);
    this.rejection.set(null);
  }

  protected setGranularity(granularity: DiffGranularity): void {
    this.granularity.set(granularity);
  }

  protected setMode(mode: DiffMode): void {
    this.mode.set(mode);
  }

  protected setViewMode(mode: DiffViewMode): void {
    this.viewMode.set(mode);
  }

  protected setMergeMode(mode: MergeMode): void {
    this.mergeMode.set(mode);
    this.threeWayDecisions.set(new Map());
  }

  protected toggleIgnoreOption(key: keyof IgnoreOptions): void {
    this.ignoreOptions.update((current) => ({ ...current, [key]: !current[key] }));
  }

  protected toggleDetectMovedBlocks(): void {
    this.detectMovedBlocksEnabled.update((v) => !v);
  }

  protected movedAnnotationFor(hunkIndex: number): MovedBlockAnnotation | undefined {
    return this.movedBlockAnnotations().get(hunkIndex);
  }

  protected onLeftInput(event: Event): void {
    this.left.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRightInput(event: Event): void {
    this.right.set((event.target as HTMLTextAreaElement).value);
  }

  protected onBaseInput(event: Event): void {
    this.base.set((event.target as HTMLTextAreaElement).value);
  }

  protected async onLeftFileSelected(file: File): Promise<void> {
    this.left.set(await file.text());
  }

  protected async onRightFileSelected(file: File): Promise<void> {
    this.right.set(await file.text());
  }

  protected async onBaseFileSelected(file: File): Promise<void> {
    this.base.set(await file.text());
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected onRatioChange(ratio: number): void {
    this.paneRatio.set(ratio);
  }

  protected run(): void {
    this.job()?.cancel();
    this.mergeDecisions.set(new Map());
    this.threeWayDecisions.set(new Map());
    this.activeHunk.set(0);

    const payload: AdvancedDiffPayload = {
      left: this.left(),
      right: this.right(),
      mode: this.mode(),
      granularity: this.granularity(),
      ignoreOptions: this.ignoreOptions(),
      base: this.mergeMode() === 'three-way' ? this.base() : undefined,
    };
    this.job.set(
      this.workerClient.run<AdvancedDiffPayload, AdvancedDiffResult>(
        () => new Worker(new URL('./advanced-diff.worker', import.meta.url), { type: 'module' }),
        payload,
      ),
    );
  }

  protected cancel(): void {
    this.job()?.cancel();
  }

  protected onLeftImageSelected(file: File): void {
    this.leftImageFile.set(file);
  }

  protected onRightImageSelected(file: File): void {
    this.rightImageFile.set(file);
  }

  protected onImageThresholdChange(event: Event): void {
    this.imageThreshold.set(Number((event.target as HTMLInputElement).value) || 0.1);
  }

  protected async runImageDiff(): Promise<void> {
    const left = this.leftImageFile();
    const right = this.rightImageFile();
    if (!left || !right) return;

    this.imageJob()?.cancel();

    const [leftBuffer, rightBuffer] = await Promise.all([left.arrayBuffer(), right.arrayBuffer()]);
    const payload: AdvancedDiffImagePayload = { left: leftBuffer, right: rightBuffer, threshold: this.imageThreshold() };

    this.imageJob.set(
      this.workerClient.run<AdvancedDiffImagePayload, AdvancedDiffImageResult>(
        () => new Worker(new URL('./advanced-diff-image.worker', import.meta.url), { type: 'module' }),
        payload,
        [leftBuffer, rightBuffer],
      ),
    );
  }

  protected cancelImageDiff(): void {
    this.imageJob()?.cancel();
  }

  protected clear(): void {
    this.job()?.cancel();
    this.imageJob()?.cancel();
    this.left.set('');
    this.right.set('');
    this.base.set('');
    this.job.set(null);
    this.imageJob.set(null);
    this.leftImageFile.set(null);
    this.rightImageFile.set(null);
    this.mergeDecisions.set(new Map());
    this.threeWayDecisions.set(new Map());
    this.rejection.set(null);
  }

  protected acceptHunk(hunkIndex: number, decision: MergeDecision): void {
    const next = new Map(this.mergeDecisions());
    next.set(hunkIndex, decision);
    this.mergeDecisions.set(next);
  }

  protected acceptThreeWayHunk(hunkIndex: number, decision: ThreeWayDecision): void {
    const next = new Map(this.threeWayDecisions());
    next.set(hunkIndex, decision);
    this.threeWayDecisions.set(next);
  }

  protected threeWayDecisionFor(hunkIndex: number): ThreeWayDecision | undefined {
    return this.threeWayDecisions().get(hunkIndex);
  }

  protected isResolved(hunkIndex: number): boolean {
    return this.mergeDecisions().has(hunkIndex);
  }

  protected decisionFor(hunkIndex: number): MergeDecision | undefined {
    return this.mergeDecisions().get(hunkIndex);
  }

  protected goToHunk(index: number): void {
    const hunks = this.hunks();
    if (hunks.length === 0) return;
    this.activeHunk.set(((index % hunks.length) + hunks.length) % hunks.length);
    document.getElementById(`hunk-${this.activeHunk()}`)?.scrollIntoView({ block: 'nearest' });
  }

  protected nextHunk(): void {
    this.goToHunk(this.activeHunk() + 1);
  }

  protected previousHunk(): void {
    this.goToHunk(this.activeHunk() - 1);
  }

  protected lineClasses(type: DiffLineType): string {
    return LINE_CLASSES[type];
  }

  protected linePrefix(type: DiffLineType): string {
    return LINE_PREFIX[type];
  }

  protected segmentClasses(type: DiffSegmentType): string {
    return SEGMENT_CLASSES[type];
  }

  protected copy(text: string): void {
    void navigator.clipboard.writeText(text);
  }

  ngOnDestroy(): void {
    this.job()?.cancel();
    this.imageJob()?.cancel();
  }
}
