import type { EChartsCoreOption } from 'echarts/core';

export interface SparklinePoint {
  readonly label: string;
  readonly value: number;
}

export interface SparklineSummary {
  readonly last: number;
  readonly min: number;
  readonly max: number;
}

/** Pure data-shaping for `SparklineChart` (DUDE_PRD.md §21 Phase 30C.3) — kept outside the
 *  component so it's unit-testable without instantiating ECharts. */
export function summarizeSparkline(points: readonly SparklinePoint[]): SparklineSummary | undefined {
  if (!points.length) return undefined;
  const values = points.map((p) => p.value);
  return { last: values[values.length - 1], min: Math.min(...values), max: Math.max(...values) };
}

export function buildSparklineOption(points: readonly SparklinePoint[], lineColor: string, mutedColor: string): EChartsCoreOption {
  return {
    animation: false,
    grid: { left: 2, right: 2, top: 4, bottom: 2, containLabel: false },
    xAxis: { type: 'category', show: false, data: points.map((p) => p.label) },
    yAxis: { type: 'value', show: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'transparent',
      borderWidth: 0,
      textStyle: { color: mutedColor, fontSize: 11 },
      padding: 0,
      formatter: (params: unknown) => {
        const point = Array.isArray(params) ? params[0] : params;
        const name = (point as { name?: string })?.name ?? '';
        const value = (point as { value?: number })?.value ?? '';
        return `${name}: ${value}`;
      },
    },
    series: [
      {
        type: 'line',
        data: points.map((p) => p.value),
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 1.5, color: lineColor },
        areaStyle: { color: lineColor, opacity: 0.08 },
      },
    ],
  };
}
