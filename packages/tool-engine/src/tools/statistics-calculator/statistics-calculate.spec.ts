import { describe, expect, it } from 'vitest';
import { computeStatistics, parseNumberList } from "./statistics-calculate.js";

describe('parseNumberList', () => {
  it('parses comma, space, and newline separated numbers', () => {
    expect(parseNumberList('1, 2\n3 4')).toEqual([1, 2, 3, 4]);
  });

  it('returns null for empty or non-numeric input', () => {
    expect(parseNumberList('')).toBeNull();
    expect(parseNumberList('1, two, 3')).toBeNull();
  });
});

describe('computeStatistics', () => {
  const data = [2, 4, 4, 4, 5, 5, 7, 9];

  it('matches known summary statistics for a textbook example', () => {
    const result = computeStatistics(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.count).toBe(8);
    expect(result.value.sum).toBe(40);
    expect(result.value.mean).toBe(5);
    expect(result.value.median).toBe(4.5);
    expect(result.value.mode).toEqual([4]);
    expect(result.value.min).toBe(2);
    expect(result.value.max).toBe(9);
    expect(result.value.range).toBe(7);
    expect(result.value.stdDevPopulation).toBe(2);
    expect(result.value.stdDevSample).toBeCloseTo(2.13809, 4);
  });

  it('returns null sample variance/stddev for a single value (undefined mathematically)', () => {
    const result = computeStatistics([5]);
    expect(result.ok && result.value.varianceSample).toBeNull();
    expect(result.ok && result.value.stdDevSample).toBeNull();
    expect(result.ok && result.value.stdDevPopulation).toBe(0);
  });

  it('rejects an empty list', () => {
    expect(computeStatistics([]).ok).toBe(false);
  });
});
