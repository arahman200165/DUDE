import { buildRankedBarsOption } from "./ranked-bars-chart-option.js";

const items = [
  { label: 'Developer', value: 42, color: '#34d399' },
  { label: 'Data', value: 30, color: '#22d3ee' },
  { label: 'Text', value: 10, color: '#a3e635' },
];

describe('buildRankedBarsOption', () => {
  it('reverses row order so the highest-ranked item draws at the top', () => {
    const option = buildRankedBarsOption(items, '#8b93a3') as any;
    expect(option.yAxis.data).toEqual(['Text', 'Data', 'Developer']);
  });

  it('carries each item value and resolved color into the bar series', () => {
    const option = buildRankedBarsOption(items, '#8b93a3') as any;
    expect(option.series[0].data).toEqual([
      { value: 10, itemStyle: { color: '#a3e635' } },
      { value: 30, itemStyle: { color: '#22d3ee' } },
      { value: 42, itemStyle: { color: '#34d399' } },
    ]);
  });

  it('shows value labels and hides the axis line for a compact look', () => {
    const option = buildRankedBarsOption(items, '#8b93a3') as any;
    expect(option.series[0].label.show).toBe(true);
    expect(option.yAxis.axisLine.show).toBe(false);
  });
});

describe('buildRankedBarsOption with no items', () => {
  it('fabricates no rows or values', () => {
    const option = buildRankedBarsOption([], '#8b93a3') as any;
    expect(option.yAxis.data).toEqual([]);
    expect(option.series[0].data).toEqual([]);
  });
});
