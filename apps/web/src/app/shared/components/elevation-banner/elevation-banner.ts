import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ElevationService } from '../../../core/platform/elevation.service';
import { StatusGlyph } from '../status-glyph/status-glyph';

/**
 * Compact "needs administrator" strip for Windows tools. Renders nothing when the session is already
 * elevated (or on the web, where elevation is unknown) or when nothing was denied and the feature
 * doesn't wholly require admin. Relaunch is deliberate, like the network workbench's: an explicit
 * confirmation step, the app closes only if Windows grants elevation, and nothing reruns afterwards.
 */
@Component({
  selector: 'app-elevation-banner',
  imports: [StatusGlyph],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="flex flex-col gap-2 rounded-sm border border-warning/50 bg-warning/5 p-2 text-ui text-warning" role="status">
        <div class="flex flex-wrap items-center gap-2">
          <app-status-glyph kind="warning" />
          <span>{{ message() }}</span>
          <button
            type="button"
            class="rounded-sm border border-border px-2 py-0.5 text-text hover:bg-panel-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            (click)="prompt.set(true)"
          >
            Relaunch as Administrator
          </button>
        </div>
        @if (prompt()) {
          <div class="rounded-sm border border-warning/50 bg-warning/5 p-2">
            <p class="text-text-muted">Windows will ask for administrator permission. The current app will close only if elevation succeeds. No check runs automatically after relaunch.</p>
            <div class="mt-2 flex gap-2">
              <button type="button" class="rounded-sm border border-warning px-2 py-0.5 text-warning" (click)="relaunch()">Request elevation</button>
              <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-text" (click)="prompt.set(false)">Cancel</button>
            </div>
          </div>
        }
        @if (error()) { <p class="text-error" role="alert">{{ error() }}</p> }
      </div>
    }
  `,
})
export class ElevationBanner implements OnInit {
  private readonly elevation = inject(ElevationService);

  readonly deniedCount = input(0);
  /** The feature as a whole needs administrator access. */
  readonly required = input(false);
  readonly feature = input('');

  protected readonly prompt = signal(false);
  protected readonly error = signal('');

  protected readonly visible = computed(() => this.elevation.elevated() === false && (this.required() || this.deniedCount() > 0));

  protected readonly message = computed(() => {
    if (this.required()) return `${this.feature() || 'This feature'} needs an elevated session.`;
    const count = this.deniedCount();
    return `${count} ${count === 1 ? 'item needs' : 'items need'} administrator access.`;
  });

  ngOnInit(): void { void this.elevation.refresh(); }

  protected async relaunch(): Promise<void> {
    this.prompt.set(false);
    this.error.set('');
    try {
      const accepted = await this.elevation.relaunch();
      if (!accepted) this.error.set('Administrator relaunch was declined. Current session is unchanged.');
    } catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
  }
}
