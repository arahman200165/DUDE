import { Component, computed, effect, inject, input, OnDestroy, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SysApplyResult, SysPlanPreview } from "@dude/contracts/system/sys-mutation-types";
import { SystemMutationService } from '../../../core/platform/system-mutation.service';
import { ElevationBanner } from '../elevation-banner/elevation-banner';
import { StatusGlyph } from '../status-glyph/status-glyph';

const LONG_VALUE = 120;

/**
 * The shared preview → confirm → apply surface for every Phase 31 tool that changes Windows system
 * state (DUDE_PRD.md §5.2.1, Milestone 594), sibling of `app-mutation-preview`. Step 1 is the preview:
 * every operation, exactly as the main process will perform it, with blocked operations listed.
 * Step 2 is a separate, explicit confirm panel — typed names for critical targets and a no-undo
 * acknowledgement when needed — and only its button calls `SystemMutationService.confirmAndApply`.
 * Leaving without applying discards the plan.
 */
@Component({
  selector: 'app-system-change-preview',
  imports: [RouterLink, ElevationBanner, StatusGlyph],
  template: `
    @if (preview(); as plan) {
      <section class="flex flex-col gap-2 rounded-sm border border-warning/40 bg-panel p-3 text-ui" data-testid="system-change-preview">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 class="font-semibold text-text">Preview: {{ plan.title }}</h3>
          <span class="text-ui-xs text-text-muted">{{ plan.elevated ? 'Elevated session' : 'Standard (non-elevated) session' }}</span>
        </div>

        @if (needsElevation()) { <app-elevation-banner [required]="true" feature="This change" /> }

        <ul class="flex flex-col gap-1">
          @for (op of plan.ops; track op.index) {
            <li class="flex flex-col gap-1 rounded-sm border border-border p-2" [attr.data-testid]="'system-change-op-' + op.index">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-ui-xs text-accent">{{ op.kind }}</span>
                <span class="min-w-0 break-all font-mono text-text">{{ op.target }}</span>
                @if (op.requiresElevation) { <span class="rounded-sm border border-warning px-1 text-ui-xs text-warning">needs admin</span> }
                @if (op.typedConfirm) { <span class="rounded-sm border border-error px-1 text-ui-xs text-error">typed confirmation</span> }
                @if (op.noUndo) { <span class="rounded-sm border border-error px-1 text-ui-xs text-error">no undo</span> }
                @if (blockedReason(op.index); as reason) { <span class="flex items-center gap-1 text-ui-xs text-error"><app-status-glyph kind="error" />Blocked: {{ reason }}</span> }
              </div>
              <span class="whitespace-pre-line text-text-muted">{{ op.summary }}</span>
              @if (op.before !== undefined || op.after !== undefined) {
                <div class="grid gap-1 font-mono text-ui-xs md:grid-cols-2">
                  @if (op.before !== undefined) { <div class="min-w-0"><span class="text-text-muted">before</span> @if (isLong(op.before)) { <details><summary class="cursor-pointer text-text">{{ op.before.slice(0, 80) }}…</summary><pre class="whitespace-pre-wrap break-all text-text">{{ op.before }}</pre></details> } @else { <span class="whitespace-pre-wrap break-all text-text">{{ op.before }}</span> }</div> }
                  @if (op.after !== undefined) { <div class="min-w-0"><span class="text-text-muted">after</span> @if (isLong(op.after)) { <details><summary class="cursor-pointer text-text">{{ op.after.slice(0, 80) }}…</summary><pre class="whitespace-pre-wrap break-all text-text">{{ op.after }}</pre></details> } @else { <span class="whitespace-pre-wrap break-all text-text">{{ op.after }}</span> }</div> }
                </div>
              }
              @for (warning of op.warnings; track $index) {
                <span class="flex items-center gap-1 text-ui-xs text-warning"><app-status-glyph kind="warning" />{{ warning }}</span>
              }
            </li>
          }
        </ul>

        @if (plan.blocked.length) {
          <div class="flex flex-col gap-1 rounded-sm border border-error/50 p-2 text-ui-xs text-error" role="alert" data-testid="system-change-blocked">
            <span class="flex items-center gap-1 font-semibold"><app-status-glyph kind="error" />{{ plan.blocked.length }} operation(s) cannot be applied, so this plan cannot be applied.</span>
            <ul>@for (item of plan.blocked; track item.index) { <li>Operation {{ item.index + 1 }}: {{ item.reason }}</li> }</ul>
          </div>
        }

        @switch (stage()) {
          @case ('review') {
            <div class="flex flex-wrap items-center gap-2 border-t border-border pt-2">
              <button type="button" class="rounded-sm border border-warning px-3 py-1 text-warning disabled:opacity-50" data-testid="system-change-review-apply" [disabled]="plan.blocked.length > 0" (click)="review()">Review &amp; apply…</button>
              <button type="button" class="rounded-sm border border-border px-3 py-1 text-text" data-testid="system-change-discard" (click)="discard()">Discard</button>
              <span class="text-ui-xs text-text-muted">Preview expires {{ plan.expiresAt.slice(11, 16) }} UTC. Nothing has changed on this PC yet.</span>
            </div>
          }
          @case ('confirm') {
            <div class="flex flex-col gap-2 rounded-sm border border-warning bg-panel-elevated p-2" role="alertdialog" aria-label="Confirm system changes">
              <p class="text-text">Apply {{ plan.ops.length }} change(s) to this PC? Anything that changed since this preview is skipped and reported.</p>
              @for (name of plan.typedConfirm; track $index) {
                <label class="flex flex-col gap-1 text-text-muted">Type <span class="font-mono text-text">{{ name }}</span> to confirm
                  <input class="rounded-sm border border-border bg-panel px-2 py-1 font-mono text-text" [attr.data-testid]="'system-change-typed-' + $index" autocomplete="off" spellcheck="false" [value]="typed()[$index] ?? ''" (input)="setTyped($index, $any($event.target).value)" />
                </label>
              }
              @if (plan.noUndo) {
                <label class="flex items-center gap-2 text-warning"><input type="checkbox" data-testid="system-change-accept-no-undo" [checked]="acceptNoUndo()" (change)="acceptNoUndo.set($any($event.target).checked)" /> I understand {{ noUndoCount() }} change(s) cannot be undone</label>
              }
              <div class="flex gap-2">
                <button type="button" class="rounded-sm border border-warning px-3 py-1 font-semibold text-warning disabled:opacity-50" data-testid="system-change-confirm" [disabled]="!canConfirm()" (click)="apply()">Confirm</button>
                <button type="button" class="rounded-sm border border-border px-3 py-1 text-text" data-testid="system-change-back" (click)="stage.set('review')">Back</button>
              </div>
            </div>
          }
          @case ('applying') {
            <div class="flex items-center gap-2 text-accent"><app-status-glyph kind="busy" />Applying… {{ progressText() }}<button type="button" class="rounded-sm border border-border px-2 py-0.5 text-text" data-testid="system-change-cancel" (click)="cancel()">Cancel</button></div>
          }
          @case ('done') {
            @if (result(); as outcome) {
              <div class="flex flex-col gap-1 border-t border-border pt-2" role="status" data-testid="system-change-outcome">
                <div class="flex flex-wrap gap-3">
                  <span class="flex items-center gap-1 text-success"><app-status-glyph kind="success" />{{ outcome.applied }} applied</span>
                  @if (outcome.conflicts) { <span class="flex items-center gap-1 text-warning"><app-status-glyph kind="warning" />{{ outcome.conflicts }} conflict(s), skipped as changed since the preview</span> }
                  @if (outcome.failed) { <span class="flex items-center gap-1 text-error"><app-status-glyph kind="error" />{{ outcome.failed }} failed</span> }
                  @if (outcome.cancelled) { <span class="flex items-center gap-1 text-warning"><app-status-glyph kind="cancelled" />{{ outcome.cancelled }} cancelled</span> }
                </div>
                <a routerLink="/tools/system-changes" class="text-ui-xs text-accent underline">Review or undo in System Changes</a>
              </div>
            }
          }
        }
        @if (error()) { <div role="alert" class="flex items-center gap-1 text-error"><app-status-glyph kind="error" />{{ error() }}</div> }
      </section>
    }
  `,
})
export class SystemChangePreview implements OnDestroy {
  private readonly mutations = inject(SystemMutationService);

  readonly preview = input<SysPlanPreview | null>(null);
  readonly applied = output<SysApplyResult>();
  readonly discarded = output<void>();

  protected readonly stage = signal<'review' | 'confirm' | 'applying' | 'done'>('review');
  protected readonly typed = signal<readonly string[]>([]);
  protected readonly acceptNoUndo = signal(false);
  protected readonly result = signal<SysApplyResult | null>(null);
  protected readonly error = signal('');

  protected readonly needsElevation = computed(() => {
    const plan = this.preview();
    return !!plan && plan.blocked.length > 0 && plan.ops.some((op) => op.requiresElevation) && !plan.elevated;
  });
  protected readonly noUndoCount = computed(() => this.preview()?.ops.filter((op) => op.noUndo).length ?? 0);
  protected readonly canConfirm = computed(() => {
    const plan = this.preview();
    if (!plan || plan.blocked.length) return false;
    const typed = this.typed();
    const namesMatch = plan.typedConfirm.every((name, index) => (typed[index] ?? '').trim().toLowerCase() === name.trim().toLowerCase());
    return namesMatch && (!plan.noUndo || this.acceptNoUndo());
  });
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
      this.typed.set(plan ? plan.typedConfirm.map(() => '') : []);
    });
  }

  protected isLong(value: string): boolean { return value.length > LONG_VALUE || value.includes('\n'); }
  protected blockedReason(index: number): string | undefined { return this.preview()?.blocked.find((item) => item.index === index)?.reason; }

  protected setTyped(index: number, value: string): void {
    this.typed.update((current) => current.map((entry, position) => (position === index ? value : entry)));
  }

  protected review(): void {
    const plan = this.preview();
    if (plan && plan.blocked.length === 0 && this.stage() === 'review') this.stage.set('confirm');
  }

  /** The only apply path: reachable solely from the confirm step's enabled button. */
  protected async apply(): Promise<void> {
    const plan = this.preview();
    if (!plan || this.stage() !== 'confirm' || !this.canConfirm()) return;
    this.stage.set('applying');
    this.error.set('');
    try {
      const outcome = await this.mutations.confirmAndApply(plan.planId, [...this.typed()], { acceptNoUndo: this.acceptNoUndo() });
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
