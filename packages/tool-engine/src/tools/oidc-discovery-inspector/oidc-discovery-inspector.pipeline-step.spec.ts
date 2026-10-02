import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./oidc-discovery-inspector.pipeline-step.js";

const VALID_DOC = {
  issuer: 'https://example.com',
  authorization_endpoint: 'https://example.com/authorize',
  jwks_uri: 'https://example.com/jwks',
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
};

describe('oidc-discovery-inspector pipeline step', () => {
  it('parses a valid discovery document from text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: JSON.stringify(VALID_DOC) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { findings: readonly { severity: string }[] } }).value;
      expect(value.findings.some((f) => f.severity === 'error')).toBe(false);
    }
  });

  it('accepts an already-parsed json value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: VALID_DOC });
    expect(result.ok).toBe(true);
  });

  it('flags missing required fields', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{"issuer": "https://example.com"}' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { findings: readonly { severity: string }[] } }).value;
      expect(value.findings.some((f) => f.severity === 'error')).toBe(true);
    }
  });

  it('fails on malformed json text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{not json' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'table', value: { columns: [], rows: [] } });
    expect(result.ok).toBe(false);
  });
});
