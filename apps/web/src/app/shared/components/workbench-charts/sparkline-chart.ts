import { Component, DestroyRef, ElementRef, computed, effect, inject, input } from '@angular/core';
import type { ECharts } from 'echarts/core';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { loadEcharts, readColorToken } from './echarts-loader';
import { SparklinePoint, buildSparklineOption, summarizeSparkline } from "@dude/tool-engine/shared/components/workbench-charts/sparkline-chart-option";

/**
 * Compact time-trend sparkline (DUDE_PRD.md §21 Phase 30C.3) — one point per bucket, a visible
 * last-value readout so the trend is legible without hovering, and a screen-reader-only text
 * summary as the chart's text equivalent. Reads color from design tokens; no gradients/glow.
 */
@Component({
  selector: 'app-sparkline-chart',
  templateUrl: './sparkline-chart.html',
})
export class SparklineChart {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly appearance = inject(AppearanceService);
  private chart: ECharts | undefined;

  readonly points = input.required<readonly SparklinePoint[]>();
  readonly label = input('Trend');

  protected readonly summary = computed(() => summarizeSparkline(this.points()));

  constructor() {
    if (typeof window === 'undefined') return;

    effect(() => {
      const points = this.points();
      this.appearance.revision(); // re-read the color tokens after a theme change
      void this.render(points);
    });

    const onResize = () => this.chart?.resize();
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', onResize);
      this.chart?.dispose();
    });
  }

  private async render(points: readonly SparklinePoint[]): Promise<void> {
    const echarts = await loadEcharts();
    const el = this.host.nativeElement.querySelector<HTMLElement>('[data-chart-canvas]');
    if (!el) return;

    this.chart ??= echarts.init(el, undefined, { renderer: 'canvas' });
    const lineColor = readColorToken('--color-accent');
    const mutedColor = readColorToken('--color-text-muted');
    this.chart.setOption(buildSparklineOption(points, lineColor, mutedColor), true);
  }
}
