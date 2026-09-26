import budget from './perf-budget.json';
import { buildDiffPair } from './perf-fixtures';
import { computeLineDiff } from '../src/app/tools/diff/text-diff';

describe('computeLineDiff performance', () => {
  it(`diffs two 10,000-line texts in under ${budget.textDiff10kLines}ms`, () => {
    const { left, right } = buildDiffPair(10_000);
    const start = performance.now();
    const result = computeLineDiff(left, right);
    const durationMs = performance.now() - start;

    console.log(`computeLineDiff(10k lines): ${durationMs.toFixed(1)}ms (budget ${budget.textDiff10kLines}ms)`);
    expect(result.summary.added).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(budget.textDiff10kLines);
  });
});
