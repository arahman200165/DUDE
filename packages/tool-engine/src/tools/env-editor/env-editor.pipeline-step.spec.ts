import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./env-editor.pipeline-step.js";

describe('env-editor pipeline step', () => {
  it('normalizes a .env document', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'FOO=bar\nexport BAZ="hello world"\n' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'FOO=bar\nBAZ="hello world"' } });
  });

  it('skips comments and blank lines', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '# a comment\n\nFOO=bar\n' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'FOO=bar' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: '.env Editor expects text input.', kind: 'invalid-input' } });
  });
});
