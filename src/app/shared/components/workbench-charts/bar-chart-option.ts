import type { EChartsCoreOption } from 'echarts/core';

export interface BarChartInput {
  /** Short category label, e.g. a weekday. */
  readonly label: string;
  /** Bar value, or `null` for "no data" (drawn as no bar — distinct from a real zero). */
  readonly value: number | null;
  /** Full plain-text description used for hover/focus details and the accessible name. */
  readonly detail: string;
}

/**
 * Pure data-shaping for `BarChart` (DUDE_PRD.md §21 Phase 30H.2) — kept outside the component so
 * it's unit-testable without instantiating ECharts. The category axis has equal-width slots
 * (`boundaryGap`), which the component's text row relies on to line up under each bar. No
 * animation, no tooltip: details are DOM text the user can hover *or* focus.
 */
export function buildBarChartOption(bars: readonly BarChartInput[], barColor: string, baselineColor: string): EChartsCoreOption {
  return {
    animation: false,
    grid: { left: 0, right: 0, top: 2, bottom: 2, containLabel: false },
    xAxis: {
      type: 'category',
      show: true,
      data: bars.map((b) => b.label),
      boundaryGap: true,
      axisLabel: { show: false },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: baselineColor, width: 1 } },
    },
    yAxis: { type: 'value', show: false, min: 0 },
    tooltip: { show: false },
    series: [
      {
        type: 'bar',
        data: bars.map((b) => b.value),
        barWidth: '55%',
        itemStyle: { color: barColor },
        silent: true,
      },
    ],
  };
}
