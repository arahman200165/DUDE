import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./url-percent-inspector.pipeline-step.js";

describe('url-percent-inspector pipeline step', () => {
  it('breaks down percent-encoded segments into json', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a%20b' });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'json',
        value: {
          segments: [
            { raw: 'a', kind: 'literal', decoded: 'a' },
            { raw: '%20', kind: 'encoded', decoded: ' ', bytes: [32] },
            { raw: 'b', kind: 'literal', decoded: 'b' },
          ],
          decoded: 'a b',
        },
      },
    });
  });

  it('accepts url input the same as text', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'a%20b' });
    expect(result.ok).toBe(true);
  });

  it('fails on an invalid percent-encoding sequence', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '%zz' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'URL Percent-Encoding Inspector expects text or url input.', kind: 'invalid-input' } });
  });
});
