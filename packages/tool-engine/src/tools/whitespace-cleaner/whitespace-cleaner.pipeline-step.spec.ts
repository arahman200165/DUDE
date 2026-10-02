import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./whitespace-cleaner.pipeline-step.js";

describe('whitespace-cleaner pipeline step', () => {
  it('trims and collapses whitespace, normalizing line endings to LF', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '  hello   world  \r\n  next  \r\n' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'hello world\n next' } });
  });

  it('leaves already-clean text unchanged', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'clean' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'clean' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Whitespace Cleaner expects text input.', kind: 'invalid-input' } });
  });
});
