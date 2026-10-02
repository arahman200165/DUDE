import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./k8s-resource-calculator.pipeline-step.js";

const MANIFEST =
  'spec:\n  containers:\n    - name: app\n      resources:\n        requests:\n          cpu: "250m"\n          memory: "128Mi"\n        limits:\n          cpu: "500m"\n          memory: "256Mi"\n';

describe('k8s-resource-calculator pipeline step', () => {
  it('sums container resource requests and limits', async () => {
    const result = await pipelineStep.run({ type: 'text', value: MANIFEST });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'text'; value: string }).value;
      expect(value).toContain('Requests: cpu=0.25');
      expect(value).toContain('app:');
    }
  });

  it('fails when no containers are found', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'spec: {}' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'K8s Resource Calculator expects text input.', kind: 'invalid-input' } });
  });
});
