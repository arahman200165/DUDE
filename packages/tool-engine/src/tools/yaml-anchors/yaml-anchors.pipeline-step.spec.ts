import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./yaml-anchors.pipeline-step.js";

describe('yaml-anchors pipeline step', () => {
  it('finds an anchor and its alias as a table', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a: &x 1\nb: *x\n' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'table', value: { columns: ['Anchor', 'Definitions', 'Aliases'], rows: [['x', 'a', 'b']] } },
    });
  });

  it('returns an empty table when there are no anchors', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a: 1\n' });
    expect(result).toEqual({ ok: true, output: { type: 'table', value: { columns: ['Anchor', 'Definitions', 'Aliases'], rows: [] } } });
  });

  it('fails on malformed YAML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a: [1, 2\n' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'YAML Anchor / Alias Visualizer expects text input.', kind: 'invalid-input' } });
  });
});
