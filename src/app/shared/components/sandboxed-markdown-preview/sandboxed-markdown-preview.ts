import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { SandboxedMarkdownPalette, buildSandboxedMarkdownDocument } from './sandboxed-markdown-preview-doc';

/**
 * Reads the active theme's tokens from `<html>`. The iframe document is isolated from the parent's
 * CSS custom properties, so the resolved values are copied into it as literals.
 */
function readThemePalette(colorScheme: string | undefined): Partial<SandboxedMarkdownPalette> {
  if (typeof document === 'undefined') return {};
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name).trim();
  return {
    colorScheme: colorScheme === 'light' ? 'light' : 'dark',
    text: read('--color-text'),
    textMuted: read('--color-text-muted'),
    panelElevated: read('--color-panel-elevated'),
    border: read('--color-border'),
    accent: read('--color-accent'),
  };
}

/**
 * Renders already-sanitized Markdown HTML plus user-authored custom CSS
 * inside a bare `<iframe sandbox="">` (no `allow-scripts`/`allow-same-
 * origin`) — used only when custom CSS is active; the normal in-page
 * `[innerHTML]` render stays in use for fixed, developer-authored style
 * presets, which carry zero injection risk.
 *
 * The srcdoc is rebuilt whenever `AppearanceService.revision()` changes so a theme switch
 * recolors the preview.
 *
 * Known, disclosed tradeoff: scroll-sync and TOC-click-to-scroll (Markdown
 * Workspace) read/write the preview element's scroll position directly —
 * impossible across this iframe boundary without a postMessage bridge, so
 * those features are unavailable while this component is in use.
 */
@Component({
  selector: 'app-sandboxed-markdown-preview',
  template: `<iframe [srcdoc]="srcdoc()" sandbox="" class="h-full w-full border-0 bg-panel"></iframe>`,
})
export class SandboxedMarkdownPreview {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly appearance = inject(AppearanceService);

  readonly html = input.required<string>();
  readonly css = input('');

  protected readonly srcdoc = computed<SafeHtml>(() => {
    this.appearance.revision(); // re-read the theme tokens after each theme application
    const palette = readThemePalette(this.appearance.effective()['theme']);
    return this.sanitizer.bypassSecurityTrustHtml(buildSandboxedMarkdownDocument(this.html(), this.css(), palette));
  });
}
