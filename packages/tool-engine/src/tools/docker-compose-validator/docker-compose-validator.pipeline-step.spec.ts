import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./docker-compose-validator.pipeline-step.js";

describe('docker-compose-validator pipeline step', () => {
  it('reports no issues for a valid compose document', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'services:\n  web:\n    image: nginx:1.27\n' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { issues: [] } } });
  });

  it('flags a service with no image or build', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'services:\n  web:\n    ports:\n      - "8080:80"\n' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'json'; value: { issues: readonly { path: string }[] } }).value;
      expect(value.issues.some((issue) => issue.path === 'services.web')).toBe(true);
    }
  });

  it('fails on invalid YAML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'services: [this is not\n  a mapping' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Docker Compose Validator expects text input.', kind: 'invalid-input' } });
  });
});
