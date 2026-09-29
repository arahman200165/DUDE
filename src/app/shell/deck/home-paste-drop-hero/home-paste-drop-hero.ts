import { Component, ElementRef, Injector, afterNextRender, effect, inject, signal, viewChild } from '@angular/core';
import { PasteDetectPanel } from '../../../shared/components/paste-detect-panel/paste-detect-panel';
import { SmartFileDropZone } from '../../../shared/components/smart-file-drop-zone/smart-file-drop-zone';

/**
 * Home's compact "Give it to DUDE" Smart Entry (DUDE_PRD.md §21 Phase 24 Item 1, redesigned for
 * Phase 30D/30E's idle-vs-focused contract) — a single-row idle affordance by default so it no
 * longer forces a full two-column card into the above-the-fold budget, expanding to the existing
 * `PasteDetectPanel`/`SmartFileDropZone` layout on focus, drag-enter, or paste, and collapsing back
 * on blur/Escape once both are empty. Both halves remain the same shared components `/smart-paste`
 * uses — only the surrounding idle/expanded shell is new.
 */
@Component({
  selector: 'app-home-paste-drop-hero',
  imports: [PasteDetectPanel, SmartFileDropZone],
  templateUrl: './home-paste-drop-hero.html',
})
export class HomePasteDropHero {
  private readonly pastePanel = viewChild(PasteDetectPanel);
  private readonly dropZone = viewChild(SmartFileDropZone);

  protected readonly expanded = signal(false);
  private pendingPaste: string | null = null;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private skipFocusExpand = false;

  constructor() {
    // The idle row isn't an editable element, so a paste event on it never lands in the
    // (not-yet-mounted) textarea -- capture the clipboard text here and forward it the moment
    // `PasteDetectPanel` mounts, so a single paste both expands and populates.
    effect(() => {
      const panel = this.pastePanel();
      if (panel && this.pendingPaste !== null) {
        panel.receivePaste(this.pendingPaste);
        this.pendingPaste = null;
      }
    });
  }

  protected expand(): void {
    this.expanded.set(true);
  }

  /** Focus/click on the idle row: expanding unmounts the focused row, so hand focus to the paste box. */
  protected expandFromFocus(): void {
    if (this.skipFocusExpand) {
      this.skipFocusExpand = false;
      return;
    }
    this.expand();
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLTextAreaElement>('textarea')?.focus(), { injector: this.injector });
  }

  protected onIdlePaste(event: ClipboardEvent): void {
    this.pendingPaste = event.clipboardData?.getData('text') ?? '';
    this.expand();
  }

  protected onFocusOut(event: FocusEvent, container: HTMLElement): void {
    const next = event.relatedTarget as Node | null;
    if (next && container.contains(next)) return;
    this.collapseIfEmpty();
  }

  protected onEscape(): void {
    const hadFocus = this.host.nativeElement.contains(document.activeElement);
    this.pastePanel()?.clear();
    this.dropZone()?.clear();
    this.expanded.set(false);
    if (hadFocus) {
      // Return focus to the idle row once it re-renders, without that focus re-expanding the entry.
      afterNextRender(
        () => {
          const row = this.host.nativeElement.querySelector<HTMLElement>('[role="button"]');
          if (!row) return;
          this.skipFocusExpand = true;
          row.focus();
          this.skipFocusExpand = false;
        },
        { injector: this.injector },
      );
    }
  }

  private collapseIfEmpty(): void {
    if (this.pastePanel()?.hasInput() || this.dropZone()?.hasFile()) return;
    this.expanded.set(false);
  }
}
