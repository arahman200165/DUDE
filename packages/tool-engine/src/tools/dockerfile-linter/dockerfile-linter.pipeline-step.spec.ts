import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./dockerfile-linter.pipeline-step.js";

describe('dockerfile-linter pipeline step', () => {
  it('normalizes instruction casing', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'from node\nrun echo hi' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'FROM node\nRUN echo hi' } });
  });

  it('leaves comments and blank lines untouched', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '# comment\n\nfrom node' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '# comment\n\nFROM node' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Dockerfile Linter / Formatter expects text input.', kind: 'invalid-input' } });
  });
});
