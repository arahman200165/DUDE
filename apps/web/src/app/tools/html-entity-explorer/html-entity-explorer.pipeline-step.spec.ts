import { describe, expect, it } from 'vitest';
import { pipelineStep } from './html-entity-explorer.pipeline-step';

describe('html-entity-explorer pipeline step', () => {
  it('looks up an entity by name', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'copy' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toContain('copy\t');
    }
  });

  it('looks up an entity by decimal codepoint', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '169' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value.toLowerCase()).toContain('copy');
    }
  });

  it('fails when nothing matches', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'zzzznotanentityzzzz' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'HTML Entity Explorer expects text input.', kind: 'invalid-input' } });
  });
});
