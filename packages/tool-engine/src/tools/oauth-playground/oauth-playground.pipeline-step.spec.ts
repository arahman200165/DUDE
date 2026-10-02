import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./oauth-playground.pipeline-step.js";

describe('oauth-playground pipeline step', () => {
  it('inspects an authorization callback url, extracting the code and state', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'https://app.example/callback?code=abc123&state=xyz' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'json', value: { code: 'abc123', token: undefined, state: 'xyz', error: undefined, errorDescription: undefined } },
    });
  });

  it('inspects a pasted token response json body', async () => {
    const body = JSON.stringify({ access_token: 'tok123', token_type: 'Bearer', expires_in: 3600 });
    const result = await pipelineStep.run({ type: 'text', value: body });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const inspection = result.output.value as { accessToken: string; isError: boolean };
    expect(inspection.isError).toBe(false);
    expect(inspection.accessToken).toBe('tok123');
  });

  it('flags an error token response', async () => {
    const body = JSON.stringify({ error: 'invalid_grant', error_description: 'expired code' });
    const result = await pipelineStep.run({ type: 'text', value: body });
    expect(result).toEqual({
      ok: true,
      output: { type: 'json', value: { isError: true, errorCode: 'invalid_grant', errorDescription: 'expired code' } },
    });
  });

  it('fails on invalid json text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not json' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'OAuth 2.0 Playground expects text or url input.', kind: 'invalid-input' } });
  });
});
