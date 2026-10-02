import { mean, median, mode as mathMode, quantileSeq, std, variance } from 'mathjs';

export interface StatisticsSummary {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly median: number;
  readonly mode: readonly number[];
  readonly min: number;
  readonly max: number;
  readonly range: number;
  readonly variancePopulation: number;
  readonly varianceSample: number | null;
  readonly stdDevPopulation: number;
  readonly stdDevSample: number | null;
  readonly q1: number;
  readonly q3: number;
  readonly iqr: number;
}

export type StatisticsResult = { readonly ok: true; readonly value: StatisticsSummary } | { readonly ok: false; readonly error: string };

export function parseNumberList(input: string): readonly number[] | null {
  const parts = input
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const values = parts.map(Number);
  return values.every(Number.isFinite) ? values : null;
}

export function computeStatistics(values: readonly number[]): StatisticsResult {
  if (values.length === 0) return { ok: false, error: 'Enter at least one number.' };

  const mutableValues = [...values];
  const count = mutableValues.length;
  const sum = mutableValues.reduce((a, b) => a + b, 0);
  const min = Math.min(...mutableValues);
  const max = Math.max(...mutableValues);
  const q1 = quantileSeq(mutableValues, 0.25) as number;
  const q3 = quantileSeq(mutableValues, 0.75) as number;

  return {
    ok: true,
    value: {
      count,
      sum,
      mean: mean(mutableValues) as number,
      median: median(mutableValues) as number,
      mode: mathMode(mutableValues) as number[],
      min,
      max,
      range: max - min,
      variancePopulation: variance(mutableValues, 'uncorrected') as number,
      varianceSample: count >= 2 ? (variance(mutableValues, 'unbiased') as number) : null,
      stdDevPopulation: std(mutableValues, 'uncorrected') as number,
      stdDevSample: count >= 2 ? (std(mutableValues, 'unbiased') as number) : null,
      q1,
      q3,
      iqr: q3 - q1,
    },
  };
}
