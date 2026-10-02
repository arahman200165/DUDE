import { describe, expect, it } from 'vitest';
import { pipelineStep } from "@dude/tool-engine/tools/yaml-linter/yaml-linter.pipeline-step";

describe('yaml-linter pipeline step', () => {
  it('reports a single valid document', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a: 1\nb: 2\n' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'Valid YAML — 1 document.' } });
  });

  it('reports multiple valid documents', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a: 1\n---\nb: 2\n' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'Valid YAML — 2 documents.' } });
  });

  it('fails on malformed YAML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a: [1, 2\n' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'YAML Linter expects text input.', kind: 'invalid-input' } });
  });
});
