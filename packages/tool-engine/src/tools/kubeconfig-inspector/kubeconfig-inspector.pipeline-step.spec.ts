import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./kubeconfig-inspector.pipeline-step.js";

const SAMPLE_KUBECONFIG = `
current-context: dev
clusters:
  - name: dev
    cluster:
      server: https://example.com
contexts:
  - name: dev
    context:
      cluster: dev
      user: admin
users:
  - name: admin
    user:
      token: abc123
`;

describe('kubeconfig-inspector pipeline step', () => {
  it('summarizes clusters, contexts, and users', async () => {
    const result = await pipelineStep.run({ type: 'text', value: SAMPLE_KUBECONFIG });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toEqual({
        type: 'json',
        value: {
          currentContext: 'dev',
          clusters: [{ name: 'dev', server: 'https://example.com', hasCertificateAuthorityData: false }],
          contexts: [{ name: 'dev', cluster: 'dev', user: 'admin', namespace: undefined }],
          users: [{ name: 'admin', authMethod: 'Bearer token', secretFields: { token: 'abc123' } }],
        },
      });
    }
  });

  it('fails on invalid YAML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'clusters: [unterminated' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'kubeconfig Inspector expects text input.', kind: 'invalid-input' } });
  });
});
