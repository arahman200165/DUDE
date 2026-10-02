import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./unicode-normalization.pipeline-step.js";

describe('unicode-normalization pipeline step', () => {
  it('composes a decomposed character to NFC', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'é' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'é' } });
  });

  it('leaves already-composed text unchanged', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'hello' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'hello' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Unicode Normalization expects text input.', kind: 'invalid-input' } });
  });
});
