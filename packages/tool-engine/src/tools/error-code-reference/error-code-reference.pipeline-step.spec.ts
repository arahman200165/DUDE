import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./error-code-reference.pipeline-step.js";

describe('error-code-reference pipeline step', () => {
  it('matches a hex code with or without a 0x prefix, across categories', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '80070005' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const matches = result.output.value as readonly { name: string }[];
    expect(matches.some((m) => m.name === 'E_ACCESSDENIED')).toBe(true);
  });

  it('matches by description across categories', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'segmentation' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const matches = result.output.value as readonly { category: string }[];
    expect(matches.length).toBeGreaterThan(0);
  });

  it('returns an empty array when nothing matches', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'zzzznomatch' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [] } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Error Code Reference expects text input.', kind: 'invalid-input' } });
  });
});
