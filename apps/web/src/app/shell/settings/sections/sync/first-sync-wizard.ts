import { Component, computed, inject, output, signal } from '@angular/core';
import type { FirstSyncCategoryPreview, FirstSyncChoice, FirstSyncPreview } from '@dude/contracts';
import type { SyncCategory } from '@dude/sync';
import { FIRST_SYNC_STALE, SYNC_PORT, SyncError } from '../../../../core/sync/sync.port';
import { SyncStatusService } from '../../../../core/sync/sync-status.service';
import { Disclosure } from '../../../../shared/components/disclosure/disclosure';

const CHOICES: ReadonlyArray<{ readonly id: FirstSyncChoice; readonly label: string; readonly hint: string }> = [
  { id: 'merge', label: 'Merge', hint: 'Keep both: items on either side are combined.' },
  { id: 'use-hub', label: 'Use Hub', hint: "Replace this device's copy with the Hub's." },
  { id: 'keep-local', label: 'Keep local', hint: 'Keep this device as it is; this category stays off.' },
];

/**
 * First-sync wizard. Step one only PREVIEWS (nothing uploads); the user picks Merge / Use Hub / Keep local per
 * category. Use Hub can replace local data, so it needs a second explicit confirmation (the Agent takes a recovery
 * snapshot first) before `firstSyncApply` runs. A stale preview (the Hub changed meanwhile) re-previews.
 */
@Component({
  selector: 'app-first-sync-wizard',
  imports: [Disclosure],
  template: `
    <section class="flex flex-col gap-3 rounded-sm border border-border p-3" data-testid="first-sync" aria-labelledby="first-sync-title">
      <h3 id="first-sync-title" class="text-ui-sm font-semibold text-text">First sync</h3>
      @if (loading()) {
        <p class="text-ui text-text-muted" role="status">Comparing this device with the Hub...</p>
      }
      @if (error(); as message) {
        <p class="text-ui text-error" role="alert" data-testid="first-sync-error">{{ message }}</p>
      }
      @if (preview(); as p) {
        @if (!confirming()) {
          <p class="text-ui text-text-muted">
            Nothing has been uploaded yet. Choose what happens to each category; you can change which categories sync later.
          </p>
          @for (c of p.categories; track c.category) {
            <fieldset class="flex flex-col gap-1.5 border-t border-border pt-2" [attr.data-testid]="'cat-' + c.category">
              <legend class="flex flex-wrap items-center gap-2 text-ui font-semibold text-text">
                {{ c.label }}
                @if (c.sensitivity === 'sensitive') { <span class="rounded-sm border border-warning px-1 text-ui-sm text-warning">Sensitive</span> }
              </legend>
              <p class="text-ui text-text-muted">
                This device {{ c.localCount }} · Hub {{ c.hubCount }} · {{ c.sameIdIdentical }} identical · {{ c.localOnly }} only here · {{ c.hubOnly }} only on the Hub
              </p>
              @if (c.sameIdDifferent.length > 0 || c.sameNameDifferentId.length > 0) {
                <app-disclosure [label]="'Collisions'" [badge]="c.sameIdDifferent.length + c.sameNameDifferentId.length">
                  <ul class="flex flex-col gap-0.5 text-ui text-text">
                    @for (d of c.sameIdDifferent; track d.entityId) {
                      <li>{{ d.name ?? d.entityId }}: differs on this device and the Hub. Merge sends it to the conflict inbox.</li>
                    }
                    @for (n of c.sameNameDifferentId; track n.localId) {
                      <li>{{ n.name }}: a different item with the same name exists on both. Merge keeps both and renames one.</li>
                    }
                  </ul>
                </app-disclosure>
              }
              <app-disclosure label="What leaves this device">
                <p class="text-ui text-text">{{ c.disclosure }}</p>
              </app-disclosure>
              <div class="flex flex-wrap gap-3" role="radiogroup" [attr.aria-label]="c.label + ' choice'">
                @for (choice of choices; track choice.id) {
                  <label class="flex items-center gap-1.5 text-ui text-text" [title]="choice.hint">
                    <input
                      type="radio"
                      class="accent-accent"
                      [name]="'choice-' + c.category"
                      [attr.data-testid]="'choice-' + c.category + '-' + choice.id"
                      [checked]="chosen()[c.category] === choice.id"
                      (change)="choose(c.category, choice.id)"
                    />
                    {{ choice.label }}
                  </label>
                }
              </div>
              <p class="text-ui-sm text-text-muted">{{ hint(c) }}</p>
            </fieldset>
          }
          <div class="flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <button type="button" class="rounded-sm bg-accent px-3 py-0.5 text-ui text-on-accent disabled:opacity-50" data-testid="first-sync-continue" [disabled]="applying()" (click)="next()">
              {{ replacing().length > 0 ? 'Continue' : 'Start syncing' }}
            </button>
            <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" (click)="cancelled.emit()">Cancel</button>
          </div>
        } @else {
          <div class="flex flex-col gap-2 rounded-sm border border-warning p-3" role="alertdialog" aria-labelledby="use-hub-title" data-testid="use-hub-confirm">
            <h4 id="use-hub-title" class="text-ui font-semibold text-warning">Replace this device's data?</h4>
            <p class="text-ui text-text">Use Hub replaces what this device has with the Hub's copy for:</p>
            <ul class="list-disc pl-4 text-ui text-text">
              @for (label of replacing(); track label) { <li>{{ label }}</li> }
            </ul>
            <p class="text-ui text-text-muted">A recovery snapshot of this device's store is taken first, so it can be restored. Nothing else is changed.</p>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="rounded-sm border border-error px-3 py-0.5 text-ui text-error disabled:opacity-50" data-testid="use-hub-apply" [disabled]="applying()" (click)="apply()">Replace and sync</button>
              <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" [disabled]="applying()" (click)="confirming.set(false)">Back</button>
            </div>
          </div>
        }
      }
    </section>
  `,
})
export class FirstSyncWizard {
  private readonly port = inject(SYNC_PORT);
  private readonly sync = inject(SyncStatusService);

  readonly finished = output<void>();
  readonly cancelled = output<void>();

  protected readonly choices = CHOICES;
  protected readonly preview = signal<FirstSyncPreview | null>(null);
  protected readonly chosen = signal<Partial<Record<SyncCategory, FirstSyncChoice>>>({});
  protected readonly loading = signal(false);
  protected readonly applying = signal(false);
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Labels of categories where Use Hub could replace local data. */
  protected readonly replacing = computed(() => {
    const p = this.preview();
    if (!p) return [];
    return p.categories.filter((c) => this.chosen()[c.category] === 'use-hub').map((c) => c.label);
  });

  constructor() { void this.load(); }

  protected choose(category: SyncCategory, choice: FirstSyncChoice): void {
    this.chosen.update((current) => ({ ...current, [category]: choice }));
  }

  protected hint(c: FirstSyncCategoryPreview): string {
    return CHOICES.find((x) => x.id === this.chosen()[c.category])?.hint ?? '';
  }

  protected next(): void {
    if (this.replacing().length > 0) this.confirming.set(true);
    else void this.apply();
  }

  protected async apply(): Promise<void> {
    const port = this.port;
    const p = this.preview();
    if (port === null || p === null) return;
    this.applying.set(true);
    this.error.set(null);
    try {
      await port.firstSyncApply(this.chosen(), p.digest, this.replacing().length > 0 ? (p.confirmToken ?? undefined) : undefined);
      await this.sync.refresh();
      this.finished.emit();
    } catch (error) {
      this.confirming.set(false);
      if (error instanceof SyncError && error.code === FIRST_SYNC_STALE) {
        await this.load('The Hub changed while you were reviewing. Review the updated comparison.');
      } else {
        this.error.set(error instanceof Error ? error.message : 'First sync failed.');
      }
    } finally {
      this.applying.set(false);
    }
  }

  private async load(notice?: string): Promise<void> {
    const port = this.port;
    if (port === null) return;
    this.loading.set(true);
    this.error.set(notice ?? null);
    try {
      const p = await port.firstSyncPreview();
      this.preview.set(p);
      this.chosen.set(Object.fromEntries(p.categories.map((c) => [c.category, c.recommended])));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not compare with the Hub.');
    } finally {
      this.loading.set(false);
    }
  }
}
