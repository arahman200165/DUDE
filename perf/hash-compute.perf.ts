import budget from './perf-budget.json';
import { buildLargeText } from './perf-fixtures';
import { computeHash, HASH_ALGORITHMS } from "@dude/crypto/hash-compute";

// Performance regression corpus (DUDE_PRD.md §21 Phase 23 Item 10) -- generous budgets (see
// perf-budget.json), reported for visibility rather than gating the required CI deploy step
// (scripts/check-cache-budget.mjs's precedent for "hard-fail one number, report the rest" is a
// bundle-size concern; wall-clock timing on shared CI runners varies too much to safely block a
// release on, so this stays an opt-in `npm run test:perf` check).

describe('computeHash performance', () => {
  it(`hashes a 5MB input with SHA-256 in under ${budget.hashCompute5MbSha256}ms`, async () => {
    const text = buildLargeText(5 * 1024 * 1024);
    const start = performance.now();
    await computeHash(text, 'SHA-256');
    const durationMs = performance.now() - start;

    console.log(`computeHash(5MB, SHA-256): ${durationMs.toFixed(1)}ms (budget ${budget.hashCompute5MbSha256}ms)`);
    expect(durationMs).toBeLessThan(budget.hashCompute5MbSha256);
  });

  it(`hashes a 1MB input with every supported algorithm in under ${budget.hashComputeAllAlgorithms1Mb}ms`, async () => {
    const text = buildLargeText(1024 * 1024);
    const start = performance.now();
    for (const algorithm of HASH_ALGORITHMS) await computeHash(text, algorithm);
    const durationMs = performance.now() - start;

    console.log(`computeHash(1MB, all ${HASH_ALGORITHMS.length} algorithms): ${durationMs.toFixed(1)}ms (budget ${budget.hashComputeAllAlgorithms1Mb}ms)`);
    expect(durationMs).toBeLessThan(budget.hashComputeAllAlgorithms1Mb);
  });
});
