import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
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
 */
@Component({
  selector: 'app-css-preview-sandbox',
  template: `<iframe [srcdoc]="srcdoc()" sandbox="" class="dude-doc-frame h-full w-full border-0 bg-panel"></iframe>`,
})
export class CssPreviewSandbox {
  private readonly sanitizer = inject(DomSanitizer);

  readonly css = input('');
  readonly html = input('');

  protected readonly srcdoc = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(buildCssPreviewDoc(this.css(), this.html())));
}
