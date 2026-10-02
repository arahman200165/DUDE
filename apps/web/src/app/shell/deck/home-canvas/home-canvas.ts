import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, runInInjectionContext, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HomeLayoutService } from '../../../core/home-layout/home-layout.service';
import { resolveCells, widthOf } from "@dude/tool-engine/core/home-layout/home-cells";
import { PanelRegistryService } from '../../../core/registry/panel-registry.service';
import { PanelHost } from './panel-host';

/**
 * Home's generic panel renderer (DUDE_PRD.md Phase 30I). Composes whatever the layout store and the
 * generated panel registry say — it names no panel kind. The canvas measures its own width
 * (container width, so a narrow window *or* a narrow pane both count) to choose the wide or narrow
 * placements, lays panels out on a 12-column CSS grid, and closes over the gaps left by omitted,
 * hidden or currently-empty panels. Cells are in reading order, so focus order follows the layout.
 */
@Component({
  selector: 'app-home-canvas',
  imports: [PanelHost, RouterLink],
  templateUrl: './home-canvas.html',
  host: { class: 'block min-w-0' },
})
export class HomeCanvas {
  private readonly layout = inject(HomeLayoutService);
  private readonly registry = inject(PanelRegistryService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly measured = signal(0);
  protected readonly width = computed(() => widthOf(this.measured()));

  protected readonly cells = computed(() =>
    resolveCells(this.layout.layout(), this.width(), {
      definitionOf: (kindId) => this.registry.resolveKind(kindId),
      availabilityOf: (def) => this.registry.availability(def),
      shouldShow: (def) => (def.showWhen ? runInInjectionContext(this.injector, def.showWhen) : true),
    }),
  );

  constructor() {
    afterNextRender(() => {
      const el = this.host.nativeElement;
      this.measured.set(el.clientWidth);
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver((entries) => this.measured.set(Math.round(entries[0]?.contentRect.width ?? el.clientWidth)));
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
