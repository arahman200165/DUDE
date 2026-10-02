import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./dev-snippets-reference.pipeline-step.js";

describe('dev-snippets-reference pipeline step', () => {
  it('returns every entry grouped by category for an empty filter', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const groups = result.output.value as readonly { category: string }[];
    expect(groups.length).toBeGreaterThan(0);
  });

  it('filters by a search term', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'docker' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const groups = result.output.value as readonly { category: string }[];
    expect(groups.every((g) => g.category === 'Docker')).toBe(true);
  });

  it('returns an empty array when nothing matches', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'zzzznomatch' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [] } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Dev Snippets Reference expects text input.', kind: 'invalid-input' } });
  });
});
