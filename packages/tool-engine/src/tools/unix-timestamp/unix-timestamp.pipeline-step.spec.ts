import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./unix-timestamp.pipeline-step.js";

describe('unix-timestamp pipeline step', () => {
  it('parses a seconds timestamp and emits UTC ISO 8601 text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '1700000000' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '2023-11-14T22:13:20.000Z' } });
  });

  it('auto-detects an ISO 8601 date string', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '2023-11-14T22:13:20Z' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '2023-11-14T22:13:20.000Z' } });
  });

  it('fails on unparseable text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-timestamp' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Unix Timestamp Converter expects text input.', kind: 'invalid-input' } });
  });
});
