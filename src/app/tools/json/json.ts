import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PasteHandoffService } from '../../core/paste-detect/paste-handoff.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { indentString, JsonFormatResult, JsonIndent, JsonMode, processJson } from './json-format';
import { JsonFormatPayload } from './json-format-payload';
import { buildJsonTree, JsonTreeNode } from './json-tree';
import { applyJsonTreeEdit, JsonTreeEdit } from './json-tree-edit';
import { JsonTreeEditor } from './json-tree-editor';
import { computeJsonDiff, JsonDiffComputeResult } from './json-diff';
import { JsonDiffPayload } from './json-diff-payload';
import { repairJson } from './json-repair';

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

export type JsonView = 'text' | 'tree' | 'compare';

@Component({
  selector: 'app-json',
  imports: [ToolShell, BusyIndicator, ErrorPanel, JsonTreeEditor, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './json.html',
})
export class Json {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly input = this.persistence.signal('json', 'input', 'session', '');
  protected readonly mode = this.persistence.signal<JsonMode>('json', 'mode', 'local', 'pretty');
  protected readonly indent = this.persistence.signal<JsonIndent>('json', 'indent', 'local', 2);
  protected readonly view = this.persistence.signal<JsonView>('json', 'view', 'local', 'text');

  protected readonly usesWorker = computed(() => this.input().length > WORKER_THRESHOLD);
  protected readonly showTreeToggle = computed(() => !this.usesWorker());

  protected readonly treeNode = computed<{ ok: true; node: JsonTreeNode } | { ok: false; error: string } | null>(() => {
    if (!this.showTreeToggle() || this.view() !== 'tree' || this.input().trim() === '') return null;

    try {
      return { ok: true, node: buildJsonTree(JSON.parse(this.input())) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  protected readonly treeEditError = signal('');

  private readonly jobSignal = signal<WorkerJob<JsonFormatResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  protected readonly repairError = signal('');

  protected readonly compareRight = this.persistence.signal('json', 'compareRight', 'session', '');
  protected readonly usesCompareWorker = computed(() => this.input().length + this.compareRight().length > WORKER_THRESHOLD);
  private readonly compareJobSignal = signal<WorkerJob<JsonDiffComputeResult> | null>(null);
  protected readonly compareJob = this.compareJobSignal.asReadonly();

  private readonly syncCompareResult = computed<JsonDiffComputeResult | null>(() => {
    if (this.view() !== 'compare' || this.usesCompareWorker()) return null;
    if (this.input().trim() === '' || this.compareRight().trim() === '') return null;
    return computeJsonDiff(this.input(), this.compareRight());
  });

  protected readonly compareResult = computed<JsonDiffComputeResult | null>(() =>
    this.usesCompareWorker() ? (this.compareJob()?.result() ?? null) : this.syncCompareResult(),
  );

  private readonly syncResult = computed<JsonFormatResult | null>(() =>
    this.usesWorker() ? null : processJson(this.input(), this.mode(), this.indent()),
  );

  protected readonly result = computed<JsonFormatResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  constructor() {
    // Smart Paste-Detection prefill (DUDE_PRD.md §21 Phase 21 Item 3) — see PasteHandoffService.
    const handoff = inject(PasteHandoffService).consume('json');
    if (handoff !== undefined) this.input.set(handoff);

    effect((onCleanup) => {
      const input = this.input();
      const mode = this.mode();
      const indent = this.indent();

      if (input.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: JsonFormatPayload = { input, mode, indent };
      const job = this.workerClient.run<JsonFormatPayload, JsonFormatResult>(
        () => new Worker(new URL('./json-format.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });

    // Auto-dispatches a Compare job to a Worker once the combined input crosses the size threshold.
    effect((onCleanup) => {
      if (this.view() !== 'compare' || !this.usesCompareWorker()) return;
      if (this.input().trim() === '' || this.compareRight().trim() === '') return;

      const payload: JsonDiffPayload = { left: this.input(), right: this.compareRight() };
      const job = this.workerClient.run<JsonDiffPayload, JsonDiffComputeResult>(
        () => new Worker(new URL('./json-diff.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.compareJobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onCompareRightChange(event: Event): void {
    this.compareRight.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMode(mode: JsonMode): void {
    this.mode.set(mode);
  }

  protected setView(view: JsonView): void {
    this.view.set(view);
    this.treeEditError.set('');
    this.repairError.set('');
  }

  protected onTreeEdit(event: { segments: readonly (string | number)[]; edit: JsonTreeEdit }): void {
    const current = this.treeNode();
    if (!current?.ok) return;

    const applied = applyJsonTreeEdit(current.node.value, event.segments, event.edit);
    if (!applied.ok) {
      this.treeEditError.set(applied.error);
      return;
    }
    this.treeEditError.set('');
    this.input.set(JSON.stringify(applied.root, null, indentString(this.indent())));
  }

  protected repair(): void {
    const result = repairJson(this.input());
    if (!result.ok) {
      this.repairError.set(result.error);
      return;
    }
    this.repairError.set('');
    this.input.set(result.repaired);
  }

  protected onIndentChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.indent.set(value === 'tab' ? 'tab' : (Number(value) as JsonIndent));
  }

  protected clear(): void {
    this.input.set('');
    this.compareRight.set('');
    this.treeEditError.set('');
    this.repairError.set('');
  }

  protected copy(output: string): void {
    void navigator.clipboard.writeText(output);
  }

  protected format(value: unknown): string {
    return JSON.stringify(value);
  }
}
