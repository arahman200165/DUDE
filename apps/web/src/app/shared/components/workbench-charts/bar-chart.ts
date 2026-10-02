import { Component, DestroyRef, ElementRef, effect, inject, input, signal } from '@angular/core';
import type { ECharts } from 'echarts/core';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { loadEcharts, readColorToken } from './echarts-loader';
import { BarChartInput, buildBarChartOption } from "@dude/tool-engine/shared/components/workbench-charts/bar-chart-option";

/**
 * Compact column chart with keyboard-reachable bars (DUDE_PRD.md §21 Phase 30H.2). The canvas draws
 * the bars; a text row directly beneath it puts each bar's label and value on screen (readable
 * with no tooltip) and gives every bar a tab stop. Hovering or focusing a bar shows its full
 * detail line in a reserved row — no floating tooltip, no animation, no layout shift.
 */
@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.html',
})
export class BarChart {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly appearance = inject(AppearanceService);
  private chart: ECharts | undefined;

  readonly bars = input.required<readonly BarChartInput[]>();
  readonly label = input('Bar chart');
  /** Shown in the detail row when no bar is hovered/focused. */
  readonly summary = input('');

  protected readonly activeIndex = signal<number | null>(null);

  protected activeDetail(): string {
    const index = this.activeIndex();
    return index === null ? this.summary() : (this.bars()[index]?.detail ?? this.summary());
  }

  protected display(bar: BarChartInput): string {
    return bar.value === null ? '–' : String(bar.value);
  }

  constructor() {
    if (typeof window === 'undefined') return;

    effect(() => {
      const bars = this.bars();
      this.appearance.revision(); // re-read the color tokens after a theme change
      void this.render(bars);
    });

    const onResize = () => this.chart?.resize();
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', onResize);
      this.chart?.dispose();
    });
  }

  private async render(bars: readonly BarChartInput[]): Promise<void> {
    const echarts = await loadEcharts();
    const el = this.host.nativeElement.querySelector<HTMLElement>('[data-chart-canvas]');
    if (!el) return;

    this.chart ??= echarts.init(el, undefined, { renderer: 'canvas' });
    this.chart.resize();
    this.chart.setOption(buildBarChartOption(bars, readColorToken('--color-accent'), readColorToken('--color-border')), true);
  }
}
