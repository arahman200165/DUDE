import { Component, ElementRef, inject, input, signal } from '@angular/core';

/**
 * Click/focus-triggered popover revealing a truncated value's full text (DUDE_PRD.md §21
 * Phase 30C.2's "truncation with accessible full-value disclosure"). Deliberately not a native
 * `title` tooltip: those are mouse-only and invisible to keyboard/screen-reader users, so this
 * is a real focusable, dismissible disclosure instead — the same document-click/Escape pattern
 * already used by `ToolShareMenu`.
 */
@Component({
  selector: 'app-value-disclosure',
  templateUrl: './value-disclosure.html',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
    class: 'contents',
  },
})
export class ValueDisclosure {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly value = input.required<string>();

  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
