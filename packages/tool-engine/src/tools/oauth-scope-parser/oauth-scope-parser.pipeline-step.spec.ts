import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./oauth-scope-parser.pipeline-step.js";

describe('oauth-scope-parser pipeline step', () => {
  it('splits and annotates a scope string', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'openid profile custom.read' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { scopes: readonly { scope: string; known: boolean }[] } }).value;
      expect(value.scopes.map((s) => s.scope)).toEqual(['openid', 'profile', 'custom.read']);
      expect(value.scopes[0].known).toBe(true);
    }
  });

  it('reports duplicate scopes', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'openid openid email' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: { duplicates: readonly string[] } }).value.duplicates).toEqual(['openid']);
    }
  });

  it('handles an empty scope string', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: { scopes: readonly unknown[] } }).value.scopes).toEqual([]);
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'OAuth Scope Parser expects text input.', kind: 'invalid-input' } });
  });
});
