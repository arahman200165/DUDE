import { Component, Directive, computed, input, model } from '@angular/core';
import { PREVIEW_BACKGROUNDS, PreviewBackground, normalizePreviewBackground, previewBackgroundStyle } from "@dude/tool-engine/shared/components/preview-background/preview-background-style";

/**
 * Compact Theme / White / Dark / Checker chip group for tools that render a USER document
 * (HTML, SVG, images) where the document's own colors are the truth. Pair it with
 * `[appPreviewBackground]` on the element that frames the preview.
 *
 * The choice is component-local: bind `[(value)]` to a `PersistenceService.signal(toolId, key,
 * 'local', 'theme')` in the tool to remember it per tool (the same per-tool UI preference
 * pattern `viewMode`/`outputView` use elsewhere), or to a plain signal to keep it ephemeral.
 */
@Component({
  selector: 'app-preview-background',
  template: `
    <div class="flex items-center gap-1" role="group" aria-label="Preview background">
      <span class="text-ui-xs text-text-muted">Background</span>
      @for (entry of options; track entry.id) {
        <button
          type="button"
          class="dude-chip"
          [class.dude-chip-on]="current() === entry.id"
          [class.dude-chip-off]="current() !== entry.id"
          [attr.aria-pressed]="current() === entry.id"
          (click)="value.set(entry.id)"
        >
          {{ entry.label }}
        </button>
      }
    </div>
  `,
})
export class PreviewBackgroundChips {
  readonly value = model<PreviewBackground>('theme');
  protected readonly options = PREVIEW_BACKGROUNDS;
  protected readonly current = computed(() => normalizePreviewBackground(this.value()));
}

/** Applies the chosen preview background to its host element (an iframe wrapper, an image frame, ...). */
@Directive({
  selector: '[appPreviewBackground]',
  host: {
    '[style.background-color]': 'style().backgroundColor',
    '[style.background-image]': 'style().backgroundImage',
    '[style.background-size]': 'style().backgroundSize',
  },
})
export class PreviewBackgroundTarget {
  readonly appPreviewBackground = input<PreviewBackground>('theme');
  protected readonly style = computed(() => previewBackgroundStyle(normalizePreviewBackground(this.appPreviewBackground())));
}
