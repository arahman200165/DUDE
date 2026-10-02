import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./range-header-builder.pipeline-step.js";

describe('range-header-builder pipeline step', () => {
  it('parses a Range header into start/end pairs', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'bytes=0-499,1000-1499' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'json', value: [{ key: '0', value: '499' }, { key: '1000', value: '1499' }] },
    });
  });

  it('returns an empty array when the header has no "bytes=" prefix', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a range header' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [] } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Range Header Builder expects text input.', kind: 'invalid-input' },
    });
  });
});
