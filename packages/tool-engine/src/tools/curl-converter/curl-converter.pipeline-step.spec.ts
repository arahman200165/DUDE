import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./curl-converter.pipeline-step.js";

describe('curl-converter pipeline step', () => {
  it('parses a curl command into a ParsedHttpRequest json value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: `curl -X POST https://example.com -H "Accept: application/json" -d 'a=1'` });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      expect(result.output.value).toMatchObject({
        method: 'POST',
        url: 'https://example.com',
        headers: [{ key: 'Accept', value: 'application/json' }],
      });
    }
  });

  it('fails when the command does not start with "curl"', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'wget https://example.com' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'cURL Command Inspector expects text input.', kind: 'invalid-input' },
    });
  });
});
