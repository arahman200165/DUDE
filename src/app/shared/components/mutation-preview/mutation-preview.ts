import { Component, computed, effect, inject, input, OnDestroy, output, signal } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { RouterLink } from '@angular/router';
import type { ApplyResult, MutationOpKind, PlanPreview, PreviewOp } from '../../../../shared-logic/fs/fs-types';
import { formatBytes } from '../../../../shared-logic/fs/format-size';
import { FsMutationService } from '../../../core/platform/fs-mutation.service';

const KIND_LABELS: Record<MutationOpKind, string> = { rename: 'Rename', write: 'Modify', create: 'Create', trash: 'Recycle Bin' };
const KIND_CLASSES: Record<MutationOpKind, string> = { rename: 'text-accent', write: 'text-warning', create: 'text-success', trash: 'text-error' };

/**
 * The shared preview → confirm → apply surface for every Phase 29 tool that changes files
 * (DUDE_PRD.md §5.2.1, Milestone 524). Step 1 is the preview itself: every affected path, exactly as
 * the main process will touch it, with conflicts and skips listed. Step 2 is a separate, explicit
 * confirm — only its button calls `FsMutationService.confirmAndApply`, which fetches a single-use
 * token for this plan. Leaving without applying discards the plan and its staged content.
 */
@Component({
  selector: 'app-mutation-preview',
  imports: [ScrollingModule, RouterLink],
  template: `
    @if (preview(); as plan) {
      <section class="flex flex-col gap-2 rounded-sm border border-warning/40 bg-panel p-3 text-ui" data-testid="mutation-preview">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 class="font-semibold text-text">Preview: {{ plan.title }}</h3>
          <span class="font-mono text-ui-xs text-text-muted">{{ plan.root }}</span>
        </div>
        <div class="flex flex-wrap gap-3 text-text-muted">
          @for (kind of kinds; track kind) {
            @if (plan.counts[kind]) { <span><span [class]="kindClass(kind)">{{ plan.counts[kind] }}</span> {{ kindLabel(kind).toLowerCase() }}</span> }
          }
          @if (plan.skipped.length) { <span class="text-warning">{{ plan.skipped.length }} skipped</span> }
          @if (plan.backupBytes) { <span>{{ bytes(plan.backupBytes) }} of originals backed up for undo</span> }
          @if (plan.ops.length < total()) { <span class="text-warning">showing the first {{ plan.ops.length.toLocaleString() }} of {{ total().toLocaleString() }}</span> }
        </div>
        <input class="rounded-sm border border-border bg-panel px-2 py-1 text-text" placeholder="Filter affected paths" [value]="filter()" (input)="filter.set($any($event.target).value)" aria-label="Filter affected paths" />
        <cdk-virtual-scroll-viewport itemSize="26" class="h-72 rounded-sm border border-border font-mono text-ui-xs">
          <div *cdkVirtualFor="let op of visibleOps(); trackBy: trackOp" class="flex h-7 items-center gap-2 border-b border-border/40 px-2">
            <span class="w-20 shrink-0" [class]="kindClass(op.kind)">{{ kindLabel(op.kind) }}</span>
            <span class="min-w-0 flex-1 truncate text-text" [title]="op.path + (op.to ? ' → ' + op.to : '')">{{ op.path }}@if (op.to) { <span class="text-text-muted"> → </span>{{ op.to }} }</span>
            @if (op.newSize !== undefined) { <span class="shrink-0 text-text-muted">{{ bytes(op.size) }} → {{ bytes(op.newSize) }}</span> }
            @else if (op.size) { <span class="shrink-0 text-text-muted">{{ bytes(op.size) }}</span> }
            @if (op.detail) { <span class="max-w-64 shrink-0 truncate text-text-muted" [title]="op.detail">{{ op.detail }}</span> }
            @if (op.sample) { <button type="button" class="shrink-0 text-accent underline" (click)="sample.set(op)">diff</button> }
          </div>
        </cdk-virtual-scroll-viewport>
        @if (sample(); as op) {
          <div class="rounded-sm border border-border p-2">
            <div class="mb-1 flex items-center gap-2 text-text-muted"><span class="font-mono">{{ op.path }}</span><button type="button" class="ml-auto text-text" (click)="sample.set(null)">Close</button></div>
            <div class="grid gap-2 md:grid-cols-2">
              <pre class="max-h-60 overflow-auto whitespace-pre-wrap rounded-sm bg-panel-elevated p-2 text-ui-xs text-text">{{ op.sample!.before }}</pre>
              <pre class="max-h-60 overflow-auto whitespace-pre-wrap rounded-sm bg-panel-elevated p-2 text-ui-xs text-text">{{ op.sample!.after }}</pre>
            </div>
          </div>
        }
        @if (plan.skipped.length) {
          <details class="text-ui-xs text-warning">
            <summary class="cursor-pointer">{{ plan.skipped.length }} candidate(s) left out</summary>
            <ul class="max-h-40 overflow-auto font-mono">@for (item of plan.skipped; track $index) { <li>{{ item.path }} — {{ item.reason }}</li> }</ul>
          </details>
        }

        @switch (stage()) {
          @case ('review') {
            <div class="flex flex-wrap items-center gap-2 border-t border-border pt-2">
              <button type="button" class="rounded-sm border border-warning px-3 py-1 text-warning" data-testid="mutation-review-apply" (click)="stage.set('confirm')">Apply {{ total().toLocaleString() }} change(s)…</button>
              <button type="button" class="rounded-sm border border-border px-3 py-1 text-text" (click)="discard()">Discard preview</button>
              <span class="text-ui-xs text-text-muted">Preview expires {{ plan.expiresAt.slice(11, 16) }} UTC. Nothing has changed on disk yet.</span>
            </div>
          }
          @case ('confirm') {
            <div class="flex flex-col gap-2 rounded-sm border border-warning bg-warning/5 p-2" role="alertdialog" aria-label="Confirm changes">
              <p class="text-text">Change {{ total().toLocaleString() }} item(s) in <span class="font-mono">{{ plan.root }}</span>? Files changed since this preview are skipped. Overwritten originals are backed up for undo (Batch Operations); deletions go to the Recycle Bin.</p>
              @if (plan.exceedsBackupCap) {
                <label class="flex items-center gap-2 text-warning"><input type="checkbox" [checked]="acceptNoUndo()" (change)="acceptNoUndo.set($any($event.target).checked)" /> Backups would exceed the backup cap — apply with no undo for this plan</label>
              }
              <div class="flex gap-2">
                <button type="button" class="rounded-sm border border-warning bg-warning/10 px-3 py-1 font-semibold text-warning disabled:opacity-50" data-testid="mutation-confirm" [disabled]="plan.exceedsBackupCap && !acceptNoUndo()" (click)="apply()">Confirm and apply</button>
                <button type="button" class="rounded-sm border border-border px-3 py-1 text-text" (click)="stage.set('review')">Back</button>
              </div>
            </div>
          }
          @case ('applying') {
            <div class="flex items-center gap-2 text-accent">Applying… {{ progressText() }}<button type="button" class="rounded-sm border border-border px-2 py-0.5 text-text" (click)="cancel()">Stop after current item</button></div>
          }
          @case ('done') {
            @if (result(); as outcome) {
              <div class="flex flex-col gap-1 border-t border-border pt-2" role="status">
                <span class="text-success">Applied {{ outcome.applied }}.@if (outcome.conflicts) { <span class="text-warning"> {{ outcome.conflicts }} skipped as changed since the preview.</span> }@if (outcome.failed) { <span class="text-error"> {{ outcome.failed }} failed.</span> }@if (outcome.cancelled) { <span class="text-warning"> {{ outcome.cancelled }} not attempted (stopped).</span> }</span>
                @if (problems().length) {
                  <ul class="max-h-40 overflow-auto font-mono text-ui-xs text-warning">@for (op of problems(); track $index) { <li>{{ op.outcome }} — {{ op.path }}@if (op.message) { : {{ op.message }} }</li> }</ul>
                }
                <a routerLink="/tools/batch-operations" class="text-ui-xs text-accent underline">Review or undo in Batch Operations</a>
              </div>
            }
          }
        }
        @if (error()) { <div role="alert" class="text-error">{{ error() }}</div> }
      </section>
    }
  `,
})
export class MutationPreview implements OnDestroy {
  private readonly mutations = inject(FsMutationService);

  readonly preview = input<PlanPreview | null>(null);
  readonly applied = output<ApplyResult>();
  readonly discarded = output<void>();

  protected readonly kinds: readonly MutationOpKind[] = ['rename', 'write', 'create', 'trash'];
  protected readonly stage = signal<'review' | 'confirm' | 'applying' | 'done'>('review');
  protected readonly filter = signal('');
  protected readonly sample = signal<PreviewOp | null>(null);
  protected readonly acceptNoUndo = signal(false);
  protected readonly result = signal<ApplyResult | null>(null);
  protected readonly error = signal('');
  protected readonly bytes = formatBytes;

  protected readonly total = computed(() => {
    const plan = this.preview();
    return plan ? plan.counts.rename + plan.counts.write + plan.counts.create + plan.counts.trash : 0;
  });
  protected readonly visibleOps = computed(() => {
    const ops = this.preview()?.ops ?? [];
    const query = this.filter().trim().toLowerCase();
    return query ? ops.filter((op) => op.path.toLowerCase().includes(query) || (op.to ?? '').toLowerCase().includes(query)) : ops;
  });
  protected readonly problems = computed(() => (this.result()?.journal.ops ?? []).filter((op) => op.outcome !== 'applied'));
  protected readonly progressText = computed(() => {
    const progress = this.mutations.progress();
    return progress && progress.planId === this.preview()?.planId ? `${progress.done} / ${progress.total}` : '';
  });

  private pendingPlanId: string | null = null;

  constructor() {
    effect(() => {
      const plan = this.preview();
      if (this.pendingPlanId && this.pendingPlanId !== plan?.planId) void this.mutations.discard(this.pendingPlanId).catch(() => {});
      this.pendingPlanId = plan?.planId ?? null;
      this.stage.set('review');
      this.result.set(null);
      this.error.set('');
      this.acceptNoUndo.set(false);
      this.sample.set(null);
    });
  }

  protected kindLabel(kind: MutationOpKind): string { return KIND_LABELS[kind]; }
  protected kindClass(kind: MutationOpKind): string { return KIND_CLASSES[kind]; }
  protected trackOp(_index: number, op: PreviewOp): number { return op.index; }

  protected async apply(): Promise<void> {
    const plan = this.preview();
    if (!plan || this.stage() !== 'confirm') return;
    this.stage.set('applying');
    this.error.set('');
    try {
      const outcome = await this.mutations.confirmAndApply(plan.planId, { acceptNoUndo: this.acceptNoUndo() });
      this.pendingPlanId = null;
      this.result.set(outcome);
      this.stage.set('done');
      this.applied.emit(outcome);
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : String(caught));
      this.stage.set('review');
    }
  }

  protected cancel(): void {
    const plan = this.preview();
    if (plan) void this.mutations.cancelApply(plan.planId).catch(() => {});
  }

  protected discard(): void {
    if (this.pendingPlanId) void this.mutations.discard(this.pendingPlanId).catch(() => {});
    this.pendingPlanId = null;
    this.discarded.emit();
  }

  ngOnDestroy(): void {
    if (this.pendingPlanId) void this.mutations.discard(this.pendingPlanId).catch(() => {});
  }
}
