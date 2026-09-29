import { buildSparklineOption, summarizeSparkline } from './sparkline-chart-option';

const points = [
  { label: 'Mon', value: 3 },
  { label: 'Tue', value: 7 },
  { label: 'Wed', value: 1 },
];

describe('summarizeSparkline', () => {
  it('returns undefined for no points', () => {
    expect(summarizeSparkline([])).toBeUndefined();
  });

  it('reports last, min, and max', () => {
    expect(summarizeSparkline(points)).toEqual({ last: 1, min: 1, max: 7 });
  });
});

describe('buildSparklineOption', () => {
  it('maps one category label and one value per point', () => {
    const option = buildSparklineOption(points, '#38d8ff', '#8b93a3') as any;
    expect(option.xAxis.data).toEqual(['Mon', 'Tue', 'Wed']);
    expect(option.series[0].data).toEqual([3, 7, 1]);
  });

  it('disables animation and axis chrome for a compact inline chart', () => {
    const option = buildSparklineOption(points, '#38d8ff', '#8b93a3') as any;
    expect(option.animation).toBe(false);
    expect(option.xAxis.show).toBe(false);
    expect(option.yAxis.show).toBe(false);
  });

  it('uses the given line color', () => {
    const option = buildSparklineOption(points, '#ff0000', '#8b93a3') as any;
    expect(option.series[0].lineStyle.color).toBe('#ff0000');
  });
});

describe('buildSparklineOption with no points', () => {
  it('fabricates no labels or values', () => {
    const option = buildSparklineOption([], '#38d8ff', '#8b93a3') as any;
    expect(option.xAxis.data).toEqual([]);
    expect(option.series[0].data).toEqual([]);
  });
});
