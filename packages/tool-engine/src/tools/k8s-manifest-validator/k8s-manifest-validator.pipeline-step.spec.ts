import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./k8s-manifest-validator.pipeline-step.js";

describe('k8s-manifest-validator pipeline step', () => {
  it('reformats a valid manifest', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: my-pod\n' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { type: 'text'; value: string }).value).toContain('kind: Pod');
    }
  });

  it('fails on invalid YAML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'kind: [unterminated' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter a Kubernetes manifest.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'K8s Manifest Validator expects text input.', kind: 'invalid-input' } });
  });
});
