import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./lorem-ipsum-generator.pipeline-step.js";

describe('lorem-ipsum-generator pipeline step', () => {
  it('generates classic lorem ipsum paragraphs with default options', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'text') {
      expect(result.output.value.split('\n\n')).toHaveLength(3);
      expect(result.output.value).toContain('Lorem ipsum dolor sit amet');
    }
  });

  it('honors a partial options override', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { unit: 'words', count: 5 } });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'text') {
      expect(result.output.value.split(' ')).toHaveLength(5);
    }
  });

  it('rejects non-json input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'hello' });
    expect(result).toEqual({ ok: false, error: { message: 'Lorem Ipsum Generator expects a JSON options object.', kind: 'invalid-input' } });
  });
});
