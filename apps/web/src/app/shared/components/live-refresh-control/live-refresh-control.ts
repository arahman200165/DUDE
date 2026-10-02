import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, model, output, signal } from '@angular/core';
import { StatusGlyph } from '../status-glyph/status-glyph';

export const LIVE_REFRESH_INTERVALS_MS: readonly number[] = [1000, 2000, 5000, 10000];

/**
 * Pause/Resume, interval and Refresh-now controls for a live tool, paired with `createLiveRefresh`
 * (`shared/utils/live-refresh.ts`). Pure presentation: the tool owns the `intervalMs`/`paused` signals
 * and feeds `lastUpdatedAt` from the loop's `lastTickAt`.
 */
@Component({
  selector: 'app-live-refresh-control',
  imports: [StatusGlyph],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap items-center gap-2 text-ui' },
  template: `
    <button
      type="button"
      class="rounded-sm border border-border px-2 py-0.5 text-text hover:bg-panel-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      [attr.aria-pressed]="paused()"
      (click)="paused.set(!paused())"
    >
      {{ paused() ? 'Resume' : 'Pause' }}
    </button>
    <label class="flex items-center gap-1 text-text-muted">
      Refresh every
      <select
        class="rounded-sm border border-border bg-panel px-1 py-0.5 text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        [value]="intervalMs()"
        (change)="setInterval($event)"
      >
        @for (option of intervals; track option) {
          <option [value]="option" [selected]="option === intervalMs()">{{ option / 1000 }} s</option>
        }
      </select>
    </label>
    <button
      type="button"
      class="rounded-sm border border-border px-2 py-0.5 text-text hover:bg-panel-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      (click)="refreshRequested.emit()"
    >
      Refresh now
    </button>
    <span class="inline-flex items-center gap-1 text-text-muted" role="status" aria-live="off">
      <app-status-glyph [kind]="paused() ? 'idle' : 'success'" />
      {{ statusText() }}
    </span>
  `,
})
export class LiveRefreshControl {
  readonly intervalMs = model<number>(2000);
  readonly paused = model<boolean>(false);
  readonly lastUpdatedAt = input<number | null>(null);
  readonly refreshRequested = output<void>();

  protected readonly intervals = LIVE_REFRESH_INTERVALS_MS;
  private readonly now = signal(Date.now());

  protected readonly statusText = computed(() => {
    if (this.paused()) return 'Paused';
    const at = this.lastUpdatedAt();
    if (at === null) return 'Waiting for first update';
    return `Updated ${Math.max(0, Math.round((this.now() - at) / 1000))}s ago`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected setInterval(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (Number.isFinite(value) && value > 0) this.intervalMs.set(value);
  }
}
