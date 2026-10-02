import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./oauth-token-inspector.pipeline-step.js";

const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6ImVtYWlsIHByb2ZpbGUifQ.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PDO0Qc6BDUAI';

describe('oauth-token-inspector pipeline step', () => {
  it('detects and decodes a JWT-shaped token', async () => {
    const result = await pipelineStep.run({ type: 'text', value: SAMPLE_JWT });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { kind: string; scopes: readonly string[] } }).value;
      expect(value.kind).toBe('jwt');
      expect(value.scopes).toEqual(['email', 'profile']);
    }
  });

  it('reports an opaque token that looks like a uuid', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '550e8400-e29b-41d4-a716-446655440000' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { kind: string; looksLikeUuid: boolean } }).value;
      expect(value.kind).toBe('opaque');
      expect(value.looksLikeUuid).toBe(true);
    }
  });

  it('rejects empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'OAuth Token Inspector expects text input.', kind: 'invalid-input' } });
  });
});
