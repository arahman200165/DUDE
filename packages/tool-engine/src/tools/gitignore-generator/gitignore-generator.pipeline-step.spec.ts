import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./gitignore-generator.pipeline-step.js";

describe('gitignore-generator pipeline step', () => {
  it('combines the selected templates named in the input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: ['python'] });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && result.output.value).toContain('### Python ###');
  });

  it('falls back to the Node template when the input is not a string array', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { not: 'an array' } });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && result.output.value).toContain('### Node ###');
  });

  it('rejects non-json input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '[]' });
    expect(result).toEqual({ ok: false, error: { message: 'Gitignore Generator expects JSON input.', kind: 'invalid-input' } });
  });
});
