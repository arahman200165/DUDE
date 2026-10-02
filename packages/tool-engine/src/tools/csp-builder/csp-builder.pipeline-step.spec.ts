import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./csp-builder.pipeline-step.js";

describe('csp-builder pipeline step', () => {
  it('parses a CSP header into directive entries', async () => {
    const result = await pipelineStep.run({ type: 'text', value: "default-src 'self'; object-src 'none'" });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'json',
        value: [
          { name: 'default-src', values: ["'self'"] },
          { name: 'object-src', values: ["'none'"] },
        ],
      },
    });
  });

  it('returns an empty array for empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [] } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSP Builder expects text input.', kind: 'invalid-input' } });
  });
});
