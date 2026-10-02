import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./smart-quotes-normalizer.pipeline-step.js";

describe('smart-quotes-normalizer pipeline step', () => {
  it('straightens curly quotes, dashes, and ellipses', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '“Hello” — world…' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '"Hello" -- world...' } });
  });

  it('leaves plain ascii text unchanged', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'plain text' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'plain text' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Smart Quotes Normalizer expects text input.', kind: 'invalid-input' } });
  });
});
