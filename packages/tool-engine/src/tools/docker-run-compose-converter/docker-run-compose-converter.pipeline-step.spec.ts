import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./docker-run-compose-converter.pipeline-step.js";

describe('docker-run-compose-converter pipeline step', () => {
  it('converts a docker run command to a compose service block', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'docker run -p 8080:80 --name web nginx:1.27' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'text'; value: string }).value;
      expect(value).toContain('image: nginx:1.27');
      expect(value).toContain('app:');
    }
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('fails when no image is found', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'docker run -p 8080:80' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Docker Run ↔ Compose Converter expects text input.', kind: 'invalid-input' } });
  });
});
