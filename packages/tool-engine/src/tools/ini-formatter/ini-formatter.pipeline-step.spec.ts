import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./ini-formatter.pipeline-step.js";

describe('ini-formatter pipeline step', () => {
  it('converts INI text to json', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '[section]\nkey=value\n' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { section: { key: 'value' } } } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'INI Formatter / Parser expects text input.', kind: 'invalid-input' } });
  });
});
