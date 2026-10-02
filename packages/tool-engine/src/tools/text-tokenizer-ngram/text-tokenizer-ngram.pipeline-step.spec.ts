import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./text-tokenizer-ngram.pipeline-step.js";

describe('text-tokenizer-ngram pipeline step', () => {
  it('tokenizes text into word tokens', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Hello, world!' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: ['Hello', 'world'] } });
  });

  it('returns an empty list for text with no word-like tokens', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '!!!' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [] } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Text Tokenizer / N-Grams expects text input.', kind: 'invalid-input' } });
  });
});
