import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./multipart-form-builder.pipeline-step.js";

const BOUNDARY = '----DUDEFormBoundary0000000000000000';

describe('multipart-form-builder pipeline step', () => {
  it('wraps text input as a single text field', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Ada' });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'text',
        value: `--${BOUNDARY}\r\nContent-Disposition: form-data; name="field"\r\n\r\nAda\r\n--${BOUNDARY}--`,
      },
    });
  });

  it('wraps file input as a single file field with a binary-data placeholder', async () => {
    const result = await pipelineStep.run({
      type: 'file',
      value: { name: 'hello.txt', mimeType: 'text/plain', base64: 'aGVsbG8=' },
    });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'text',
        value: `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="hello.txt"\r\nContent-Type: text/plain\r\n\r\n<binary data: 5 bytes>\r\n--${BOUNDARY}--`,
      },
    });
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Multipart Form Data Builder expects text or file input.', kind: 'invalid-input' },
    });
  });
});
