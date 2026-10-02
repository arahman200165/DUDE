import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./content-disposition-builder.pipeline-step.js";

describe('content-disposition-builder pipeline step', () => {
  it('parses a Content-Disposition header into type/filename fields', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'attachment; filename="report.pdf"' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { type: 'attachment', filename: 'report.pdf' } } });
  });

  it('defaults to attachment with no filename for empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { type: 'attachment', filename: '' } } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Content-Disposition Builder expects text input.', kind: 'invalid-input' },
    });
  });
});
