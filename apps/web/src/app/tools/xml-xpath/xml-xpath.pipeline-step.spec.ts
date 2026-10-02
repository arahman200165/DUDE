import { describe, expect, it } from 'vitest';
import { pipelineStep } from './xml-xpath.pipeline-step';

describe('xml-xpath pipeline step', () => {
  it('matches every element with the fixed default "//*" expression', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<root><a>1</a><b>2</b></root>' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'text') {
      expect(result.output.value).toContain('<a>1</a>');
      expect(result.output.value).toContain('<b>2</b>');
    }
  });

  it('fails on malformed XML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<root><a></root>' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'XML XPath Tester expects text input.', kind: 'invalid-input' } });
  });
});
