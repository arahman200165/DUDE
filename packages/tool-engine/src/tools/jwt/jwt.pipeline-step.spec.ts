import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./jwt.pipeline-step.js";

const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PDO0Qc6BDUAI';

describe('jwt pipeline step', () => {
  it('decodes a valid jwt into header/payload/signature json', async () => {
    const result = await pipelineStep.run({ type: 'text', value: SAMPLE_JWT });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toEqual({
        type: 'json',
        value: {
          header: { alg: 'HS256', typ: 'JWT' },
          payload: { sub: '1234567890', name: 'John Doe' },
          signature: 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PDO0Qc6BDUAI',
        },
      });
    }
  });

  it('fails on a malformed token', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-jwt' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'JWT Debugger expects text input.', kind: 'invalid-input' } });
  });
});
