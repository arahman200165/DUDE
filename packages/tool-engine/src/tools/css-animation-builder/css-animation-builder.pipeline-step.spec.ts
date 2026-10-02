import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./css-animation-builder.pipeline-step.js";

describe('css-animation-builder pipeline step', () => {
  it('uses the piped text as the animation name', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'fade-in' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: string }).value;
      expect(value).toContain('@keyframes fade-in');
      expect(value).toContain('animation: fade-in 1.5s ease-in-out 0s infinite normal;');
    }
  });

  it('falls back to the default name "pulse" on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toContain('@keyframes pulse');
    }
  });

  it('includes the tool\'s default keyframe stops', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'x' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toContain('50% { transform: scale(1.2); opacity: 0.7; }');
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSS Animation Builder expects text input.', kind: 'invalid-input' } });
  });
});
