import { Component, DestroyRef, ElementRef, effect, inject, input } from '@angular/core';
import type { ECharts } from 'echarts/core';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { loadEcharts, readColorToken } from './echarts-loader';
import { buildRankedBarsOption } from './ranked-bars-chart-option';

export interface RankedBarInput {
  readonly label: string;
  readonly value: number;
  /** A design-token CSS variable name, e.g. `--color-cat-data`; falls back to the accent color. */
  readonly colorToken?: string;
}

/**
 * Horizontal ranked-bars chart (DUDE_PRD.md §21 Phase 30C.3) — for "which of these is bigger"
 * questions (category usage, top tools), not a pie/donut. Each bar's value label is visible
 * without hovering; a screen-reader-only list is the chart's text equivalent.
 */
@Component({
  selector: 'app-ranked-bars-chart',
  templateUrl: './ranked-bars-chart.html',
})
export class RankedBarsChart {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly appearance = inject(AppearanceService);
  private chart: ECharts | undefined;

  readonly items = input.required<readonly RankedBarInput[]>();
  readonly label = input('Ranked values');
  /** Fixed row height (px) so the host grows with the item count instead of squeezing bars. */
  readonly rowHeight = input(20);

  protected readonly height = () => Math.max(this.items().length, 1) * this.rowHeight();

  constructor() {
    if (typeof window === 'undefined') return;

    effect(() => {
      const items = this.items();
      this.appearance.revision(); // re-read the color tokens after a theme change
      void this.render(items);
    });

    const onResize = () => this.chart?.resize();
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', onResize);
      this.chart?.dispose();
    });
  }

  private async render(items: readonly RankedBarInput[]): Promise<void> {
    const echarts = await loadEcharts();
    const el = this.host.nativeElement.querySelector<HTMLElement>('[data-chart-canvas]');
    if (!el) return;

    const mutedColor = readColorToken('--color-text-muted');
    const resolved = items.map((item) => ({
      label: item.label,
      value: item.value,
      color: readColorToken(item.colorToken ?? '--color-accent'),
    }));

    this.chart ??= echarts.init(el, undefined, { renderer: 'canvas' });
    this.chart.resize();
    this.chart.setOption(buildRankedBarsOption(resolved, mutedColor), true);
  }
}
