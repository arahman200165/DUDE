import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./query-string.pipeline-step.js";

describe('query-string pipeline step', () => {
  it('parses a query string into json pairs', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a=1&b=2' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [{ key: 'a', value: '1' }, { key: 'b', value: '2' }] } });
  });

  it('parses a full url into json pairs', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'https://example.com/path?x=1' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [{ key: 'x', value: '1' }] } });
  });

  it('builds a query string from json pairs', async () => {
    const result = await pipelineStep.run({ type: 'json', value: [{ key: 'a', value: '1' }] });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'a=1' } });
  });

  it('rejects malformed json input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { not: 'an array' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'table', value: { columns: [], rows: [] } });
    expect(result.ok).toBe(false);
  });
});
