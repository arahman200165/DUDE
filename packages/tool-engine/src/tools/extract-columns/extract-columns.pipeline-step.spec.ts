import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./extract-columns.pipeline-step.js";

describe('extract-columns pipeline step', () => {
  it('extracts the first comma-delimited column', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a,b,c\nd,e,f' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'a\nd' } });
  });

  it('returns empty fields for lines without the delimiter', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'onlyonefield' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'onlyonefield' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Extract Columns expects text input.', kind: 'invalid-input' } });
  });
});
