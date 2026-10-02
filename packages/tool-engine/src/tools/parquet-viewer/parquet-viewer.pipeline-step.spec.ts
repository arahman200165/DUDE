import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./parquet-viewer.pipeline-step.js";

/** Same pre-generated fixture `parquet-decode.spec.ts` uses (see its header comment for provenance). */
const NAME_AGE_TABLE_BASE64 =
  'UEFSMRUGFSQVKFwVBBUAFQQVABUEFQAAAAMDEDwFAAAAQWxpY2UDAAAAQm9iFQYVFBUYXBUEFQAVBBUAFQQVAAAAAwMIHB4AAAAZAAAAFQQZPEgEcm9vdBUEABUMJQIYBG5hbWUlAAAVAiUCGANhZ2UAFgQZHBksJggcFQwZFQAZGARuYW1lFQIWBBZSFlImCDw2ACgDQm9iGAVBbGljZQAZHBUGFQAVAgAAACZaHBUCGRUAGRgDYWdlFQIWBBZCFkImWjw2ACgEHgAAABgEGQAAAAAZHBUGFQAVAgAAABaUARYEACgJaHlwYXJxdWV0AKMAAABQQVIx';

describe('parquet-viewer pipeline step', () => {
  it('decodes a bytes value into a table value', async () => {
    const result = await pipelineStep.run({ type: 'bytes', value: NAME_AGE_TABLE_BASE64 });
    expect(result).toEqual({
      ok: true,
      output: { type: 'table', value: { columns: ['name', 'age'], rows: [['Alice', '30'], ['Bob', '25']] } },
    });
  });

  it('decodes a file value into a table value', async () => {
    const result = await pipelineStep.run({
      type: 'file',
      value: { name: 'data.parquet', mimeType: 'application/octet-stream', base64: NAME_AGE_TABLE_BASE64 },
    });
    expect(result.ok).toBe(true);
  });

  it('fails on bytes that are not a valid Parquet file', async () => {
    const invalid = btoa(String.fromCharCode(1, 2, 3, 4, 5));
    const result = await pipelineStep.run({ type: 'bytes', value: invalid });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'Parquet Viewer expects file or bytes input.', kind: 'invalid-input' } });
  });
});
