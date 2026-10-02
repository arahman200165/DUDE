import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./yaml-path.pipeline-step.js";

describe('yaml-path pipeline step', () => {
  it('resolves the whole document with the fixed default "$" query', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a: 1\nb: 2\n' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [{ a: 1, b: 2 }] } });
  });

  it('fails on malformed YAML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a: [1, 2\n' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'YAML Path Tester expects text input.', kind: 'invalid-input' } });
  });
});
