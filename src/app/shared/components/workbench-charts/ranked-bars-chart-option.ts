import type { EChartsCoreOption } from 'echarts/core';

export interface RankedBarItem {
  readonly label: string;
  readonly value: number;
  /** Resolved CSS color (e.g. a category token's actual value), not a Tailwind class name. */
  readonly color: string;
}

/** Pure data-shaping for `RankedBarsChart` (DUDE_PRD.md §21 Phase 30C.3) — kept outside the
 *  component so it's unit-testable without instantiating ECharts. Renders top-ranked at the
 *  top by reversing the row order, since ECharts' category axis draws bottom-to-top. */
export function buildRankedBarsOption(items: readonly RankedBarItem[], mutedColor: string): EChartsCoreOption {
  const rows = [...items].reverse();
  return {
    animation: false,
    grid: { left: 4, right: 28, top: 4, bottom: 4, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: mutedColor, fontSize: 11 },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'transparent',
      borderWidth: 0,
      textStyle: { color: mutedColor, fontSize: 11 },
      padding: 0,
      formatter: (params: unknown) => {
        const point = params as { name?: string; value?: number };
        return `${point.name ?? ''}: ${point.value ?? ''}`;
      },
    },
    series: [
      {
        type: 'bar',
        data: rows.map((r) => ({ value: r.value, itemStyle: { color: r.color } })),
        barMaxWidth: 12,
        label: { show: true, position: 'right', color: mutedColor, fontSize: 11 },
      },
    ],
  };
}
