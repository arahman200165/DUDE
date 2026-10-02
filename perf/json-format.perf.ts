import budget from './perf-budget.json';
import { buildLargeJsonText } from './perf-fixtures';
import { processJson } from "@dude/tool-engine/tools/json/json-format";

describe('processJson performance', () => {
  it(`pretty-prints a ~5MB JSON document in under ${budget.jsonFormat5MbPrettyPrint}ms`, () => {
    const input = buildLargeJsonText(5 * 1024 * 1024);
    const start = performance.now();
    const result = processJson(input, 'pretty', 2);
    const durationMs = performance.now() - start;

    console.log(`processJson(~5MB, pretty): ${durationMs.toFixed(1)}ms (budget ${budget.jsonFormat5MbPrettyPrint}ms)`);
    expect(result.ok).toBe(true);
    expect(durationMs).toBeLessThan(budget.jsonFormat5MbPrettyPrint);
  });
});
