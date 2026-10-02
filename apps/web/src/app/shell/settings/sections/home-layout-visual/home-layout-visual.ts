import { Component, DestroyRef, ElementRef, ViewEncapsulation, afterNextRender, effect, inject, input, signal, viewChild } from '@angular/core';
import type { Placement } from "@dude/domain/core/home-layout/grid-engine";
import { GRID_ADAPTER_FACTORY, GridAdapter, VisualItem } from './gridstack-adapter';

/**
 * Optional drag-and-resize surface for the Home layout (DUDE_PRD.md Phase 30I). It is a pointer
 * convenience on top of the keyboard-accessible list/form editor, never the only way to do
 * anything. The parent owns the draft: every proposal from a drag, resize, or arrow key goes to
 * `propose`, which validates it through the grid engine and answers accepted/refused; the surface
 * always re-draws from `items`. Loaded on demand (`@defer`), and the drag library is imported only
 * when this component actually mounts.
 */
@Component({
  selector: 'app-home-layout-visual',
  templateUrl: './home-layout-visual.html',
  styleUrls: ['../../../../../../../../node_modules/gridstack/dist/gridstack.css', './home-layout-visual.css'],
  encapsulation: ViewEncapsulation.None,
})
export class HomeLayoutVisual {
  private readonly factory = inject(GRID_ADAPTER_FACTORY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('grid');

  readonly items = input.required<readonly VisualItem[]>();
  readonly propose = input.required<(id: string, placement: Placement) => boolean>();

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  private adapter: GridAdapter | null = null;
  private destroyed = false;

  constructor() {
    afterNextRender(() => {
      this.factory(this.host().nativeElement, this.items(), { propose: (id, p) => this.propose()(id, p) })
        .then((adapter) => {
          if (this.destroyed) {
            adapter.destroy();
            return;
          }
          this.adapter = adapter;
          this.state.set('ready');
        })
        .catch(() => this.state.set('failed'));
    });

    effect(() => {
      const items = this.items();
      this.adapter?.setItems(items);
    });

    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.adapter?.destroy();
      this.adapter = null;
    });
  }
}
