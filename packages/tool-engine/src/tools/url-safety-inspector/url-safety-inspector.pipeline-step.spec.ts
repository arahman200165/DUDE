import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./url-safety-inspector.pipeline-step.js";

describe('url-safety-inspector pipeline step', () => {
  it('reports no findings for a clean URL', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'https://example.com/a/b?x=1' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const value = result.output.value as { findings: unknown[] };
      expect(value.findings).toEqual([]);
    }
  });

  it('flags a raw IPv4 host', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'http://192.168.1.1/admin' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const value = result.output.value as { findings: { id: string }[] };
      expect(value.findings.some((f) => f.id === 'ip-literal')).toBe(true);
    }
  });

  it('fails on a non-absolute URL', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'not a url' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-url input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'https://example.com' });
    expect(result).toEqual({ ok: false, error: { message: 'URL Safety Inspector expects url input.', kind: 'invalid-input' } });
  });
});
