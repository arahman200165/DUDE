import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./xml-csv.pipeline-step.js";

describe('xml-csv pipeline step', () => {
  it('converts XML records to CSV, auto-detecting the repeating element', async () => {
    const result = await pipelineStep.run({
      type: 'text',
      value: '<root><record><a>1</a><b>2</b></record><record><a>3</a><b>4</b></record></root>',
    });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'a,b\n1,2\n3,4' } });
  });

  it('fails when the repeating record element cannot be auto-detected', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<root><a>1</a><b>2</b></root>' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'XML ↔ CSV Converter expects text input.', kind: 'invalid-input' } });
  });
});
