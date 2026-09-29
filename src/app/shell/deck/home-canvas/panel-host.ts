import { Component, computed, input } from '@angular/core';
import { unavailableReason } from '../../../core/home-layout/panel-availability';
import type { HomeCell } from '../../../core/home-layout/home-cells';
import { Disclosure } from '../../../shared/components/disclosure/disclosure';
import { PanelSlot } from './panel-slot';

/**
 * One grid cell's content: the panel itself (viewport-deferred when the kind asks for it, since the
 * heavier below-the-fold panels used to sit in `@defer (on viewport)` blocks), or — on the web, for a
 * desktop-only panel that asked to `explain` — a compact capability explanation in its place.
 */
@Component({
  selector: 'app-panel-host',
  imports: [PanelSlot, Disclosure],
  template: `
    @if (cell().availability === 'explain') {
      <section class="rounded-sm border border-border bg-panel px-3 py-2" [attr.aria-label]="cell().def.title">
        <h2 class="text-ui-sm font-semibold uppercase tracking-wider text-text-muted">{{ cell().def.title }}</h2>
        <app-disclosure class="mt-1 block" label="Desktop only" summary="why this isn't available here">
          <p class="text-ui-xs text-text-muted">{{ reason() }}</p>
        </app-disclosure>
      </section>
    } @else if (cell().def.deferUntilVisible) {
      @defer (on viewport) {
        <app-panel-slot [def]="cell().def" [instance]="cell().instance" />
      } @placeholder {
        <div class="h-full min-h-16 animate-pulse rounded-sm border border-border bg-panel-elevated" aria-hidden="true"></div>
      }
    } @else {
      <app-panel-slot [def]="cell().def" [instance]="cell().instance" />
    }
  `,
  host: { class: 'block h-full min-w-0' },
})
export class PanelHost {
  readonly cell = input.required<HomeCell>();
  protected readonly reason = computed(() => unavailableReason(this.cell().def));
}
