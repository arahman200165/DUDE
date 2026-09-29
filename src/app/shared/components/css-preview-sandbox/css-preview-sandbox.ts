import { Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { buildCssPreviewDoc } from './css-preview-sandbox-doc';

/**
 * Shared live-preview primitive for CSS-authoring tools (Box Shadow
 * Generator, Border Radius Generator, Cubic-Bezier Editor, CSS Transform
 * Builder, CSS Animation Builder, Flexbox Playground, CSS Grid Playground).
 * Reacts to `css`/`html` input changes by reassigning `srcdoc` directly —
 * unlike `LiveHtmlPreview`, there's no generation-counter/message protocol
 * here, because nothing inside this iframe ever runs a script that could
 * hang or need to report readiness back; a plain reactive `srcdoc` binding
 * is both simpler and sufficient.
 *
 * `motion` marks a preview that shows user-authored motion (CSS Animation
 * Builder, Cubic-Bezier Editor). Such a host carries `data-motion-exempt`, so
 * the global reduced-motion rule leaves it alone; instead, while the
 * Appearance motion setting resolves to `reduce`, the preview starts paused
 * and offers an explicit Play/Pause button. Editing the CSS never changes
 * the play state.
 */
@Component({
  selector: 'app-css-preview-sandbox',
  host: { '[attr.data-motion-exempt]': 'motion() ? "" : null' },
  template: `<div class="relative h-full w-full">
    <iframe [srcdoc]="srcdoc()" sandbox="" class="dude-doc-frame h-full w-full border-0 bg-panel"></iframe>
    @if (reduced()) {
      <button
        type="button"
        class="absolute right-2 top-2 rounded-sm border border-border bg-panel-elevated px-2 py-0.5 text-ui-xs text-text hover:bg-panel focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        [attr.aria-pressed]="playing()"
        [attr.aria-label]="playing() ? 'Pause animation' : 'Play animation (reduced motion is on)'"
        [attr.title]="playing() ? 'Pause animation' : 'Play animation (reduced motion is on)'"
        (click)="playing.set(!playing())"
      >
        {{ playing() ? '❚❚ Pause' : '▶ Play' }}
      </button>
    }
  </div>`,
})
export class CssPreviewSandbox {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly appearance = inject(AppearanceService);

  readonly css = input('');
  readonly html = input('');
  /** This preview shows user-authored motion (exempt from the global reduced-motion rule). */
  readonly motion = input(false);

  protected readonly playing = signal(false);
  protected readonly reduced = computed(() => this.motion() && this.appearance.effective()['motion'] === 'reduce');

  protected readonly srcdoc = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(buildCssPreviewDoc(this.css(), this.html(), { paused: this.reduced() && !this.playing() })),
  );
}
