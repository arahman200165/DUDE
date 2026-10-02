import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./resx-tool.pipeline-step.js";

const SAMPLE_RESX = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <data name="Greeting" xml:space="preserve">
    <value>Hello, {0}!</value>
    <comment>A greeting</comment>
  </data>
</root>`;

describe('resx-tool pipeline step', () => {
  it('parses a .resx document into a table of name/value/comment', async () => {
    const result = await pipelineStep.run({ type: 'text', value: SAMPLE_RESX });
    expect(result).toEqual({
      ok: true,
      output: { type: 'table', value: { columns: ['name', 'value', 'comment'], rows: [['Greeting', 'Hello, {0}!', 'A greeting']] } },
    });
  });

  it('fails on malformed XML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<root><data></root>' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Resx Tool expects text input.', kind: 'invalid-input' } });
  });
});
