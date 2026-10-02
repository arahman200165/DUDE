import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';

/**
 * Reusable resizable two-pane layout (PRD Section 13: "reusable split
 * pane"). Uncontrolled: it owns its own ratio after `initialRatio` seeds it,
 * and emits `ratioChange` on drag-end so a tool can persist the last ratio
 * as a `local` layout preference if it wants to.
 *
 * Project content into the two named slots:
 * `<app-split-pane><div slot="start">…</div><div slot="end">…</div></app-split-pane>`
 */
@Component({
  selector: 'app-split-pane',
  templateUrl: './split-pane.html',
})
export class SplitPane {
  readonly initialRatio = input(0.5);
  readonly minRatio = input(0.15);
  readonly maxRatio = input(0.85);
  readonly ratioChange = output<number>();

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');

  protected readonly ratio = signal(this.initialRatio());
  protected readonly dragging = signal(false);

  protected onDividerPointerDown(event: PointerEvent): void {
    event.preventDefault();
    this.dragging.set(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  protected onDividerPointerMove(event: PointerEvent): void {
    if (!this.dragging()) return;

    const rect = this.container().nativeElement.getBoundingClientRect();
    if (rect.width === 0) return;

    const rawRatio = (event.clientX - rect.left) / rect.width;
    this.ratio.set(Math.min(this.maxRatio(), Math.max(this.minRatio(), rawRatio)));
  }

  protected onDividerPointerUp(event: PointerEvent): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    this.ratioChange.emit(this.ratio());
  }
}
