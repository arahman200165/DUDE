import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./regex-visualizer.pipeline-step.js";

describe('regex-visualizer pipeline step', () => {
  it('renders a pattern as SVG railroad-diagram markup', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'ab+c' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type).toBe('text');
    expect(result.ok && result.output.type === 'text' && result.output.value.toLowerCase()).toContain('<svg');
  });

  it('fails on an empty pattern', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter a regular expression.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Regex Visualizer expects text input.', kind: 'invalid-input' } });
  });
});
