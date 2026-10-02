import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./svg-data-uri.pipeline-step.js";

describe('svg-data-uri pipeline step', () => {
  it('encodes SVG markup into a base64 data URI', async () => {
    const svg = '<svg></svg>';
    const result = await pipelineStep.run({ type: 'text', value: svg });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: `data:image/svg+xml;base64,${btoa(svg)}` } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('round-trips through btoa/atob for non-ASCII-free markup', async () => {
    const svg = '<svg><text>Hi</text></svg>';
    const result = await pipelineStep.run({ type: 'text', value: svg });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: string }).value;
      const payload = value.split(',')[1];
      expect(atob(payload)).toBe(svg);
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'SVG ↔ Data URI expects text input.', kind: 'invalid-input' } });
  });
});
