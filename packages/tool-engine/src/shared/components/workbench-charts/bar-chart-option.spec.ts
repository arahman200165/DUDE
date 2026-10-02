import { buildBarChartOption } from "./bar-chart-option.js";

const bars = [
  { label: 'Mon', value: 3, detail: 'Mon: 3 opens' },
  { label: 'Tue', value: null, detail: 'Tue: not tracked' },
  { label: 'Wed', value: 0, detail: 'Wed: 0 opens' },
];

describe('buildBarChartOption', () => {
  it('maps one category and one value per bar, keeping null distinct from zero', () => {
    const option = buildBarChartOption(bars, '#38d8ff', '#333') as any;
    expect(option.xAxis.data).toEqual(['Mon', 'Tue', 'Wed']);
    expect(option.series[0].data).toEqual([3, null, 0]);
  });

  it('has no animation, no tooltip, and a hidden value axis for a compact static chart', () => {
    const option = buildBarChartOption(bars, '#38d8ff', '#333') as any;
    expect(option.animation).toBe(false);
    expect(option.tooltip.show).toBe(false);
    expect(option.yAxis.show).toBe(false);
    expect(option.yAxis.min).toBe(0);
  });

  it('uses equal-width category slots so the text row lines up under the bars', () => {
    const option = buildBarChartOption(bars, '#38d8ff', '#333') as any;
    expect(option.xAxis.boundaryGap).toBe(true);
    expect(option.grid.left).toBe(0);
    expect(option.grid.right).toBe(0);
  });

  it('applies the given bar color', () => {
    const option = buildBarChartOption(bars, '#38d8ff', '#333') as any;
    expect(option.series[0].itemStyle.color).toBe('#38d8ff');
  });
});

describe('buildBarChartOption with no bars', () => {
  it('fabricates no categories or values', () => {
    const option = buildBarChartOption([], '#38d8ff', '#333') as any;
    expect(option.xAxis.data).toEqual([]);
    expect(option.series[0].data).toEqual([]);
  });
});
