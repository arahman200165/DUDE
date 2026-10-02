import { describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair } from 'jose';
import { pipelineStep } from "./jwks-to-pem.pipeline-step.js";

async function makeJwk(kid: string) {
  const { publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  return { ...jwk, kid, alg: 'RS256' };
}

describe('jwks-to-pem pipeline step', () => {
  it('converts a JWKS text document into joined PEM text', async () => {
    const jwk = await makeJwk('key-1');
    const result = await pipelineStep.run({ type: 'text', value: JSON.stringify({ keys: [jwk] }) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.type).toBe('text');
      expect((result.output as { value: string }).value).toContain('-----BEGIN PUBLIC KEY-----');
    }
  });

  it('accepts an already-parsed json value', async () => {
    const jwk = await makeJwk('key-2');
    const result = await pipelineStep.run({ type: 'json', value: { keys: [jwk] } });
    expect(result.ok).toBe(true);
  });

  it('fails on a document without a "keys" array', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{}' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'table', value: { columns: [], rows: [] } });
    expect(result).toEqual({
      ok: false,
      error: { message: 'JWKS → Public Keys expects text or JSON input.', kind: 'invalid-input' },
    });
  });
});
