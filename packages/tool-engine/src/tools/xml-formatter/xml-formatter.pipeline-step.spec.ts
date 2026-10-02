import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./xml-formatter.pipeline-step.js";

describe('xml-formatter pipeline step', () => {
  it('formats compact xml with a 2-space indent', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<a><b>1</b></a>' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toEqual({ type: 'text', value: '<a>\n  <b>1</b>\n</a>' });
    }
  });

  it('fails on malformed xml', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<a><b></a>' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'XML Formatter expects text input.', kind: 'invalid-input' } });
  });
});
