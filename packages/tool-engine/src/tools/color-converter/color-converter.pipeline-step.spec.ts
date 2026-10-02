import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./color-converter.pipeline-step.js";

describe('color-converter pipeline step', () => {
  it('parses a hex color into every format as json', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '#ff0000' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const formats = result.output.value as { hex: string; rgb: string; name?: string };
      expect(formats.hex).toBe('#ff0000');
      expect(formats.rgb).toBe('rgb(255, 0, 0)');
      expect(formats.name).toBe('red');
    }
  });

  it('fails on an unrecognized color', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-color' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Color Converter expects text input.', kind: 'invalid-input' } });
  });
});
