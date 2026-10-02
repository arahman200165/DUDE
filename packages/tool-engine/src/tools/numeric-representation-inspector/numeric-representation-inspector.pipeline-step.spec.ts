import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./numeric-representation-inspector.pipeline-step.js";

describe('numeric-representation-inspector pipeline step', () => {
  it('inspects an integer across every bit width', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '10' });
    expect(result).toEqual({
      ok: true,
      output: {
        type: 'json',
        value: [
          { bits: 8, unsignedValue: '10', signedValue: '10', hex: '0a', binary: '00001010', octal: '12', overflowed: false },
          { bits: 16, unsignedValue: '10', signedValue: '10', hex: '000a', binary: '0000000000001010', octal: '12', overflowed: false },
          {
            bits: 32,
            unsignedValue: '10',
            signedValue: '10',
            hex: '0000000a',
            binary: '00000000000000000000000000001010',
            octal: '12',
            overflowed: false,
          },
          {
            bits: 64,
            unsignedValue: '10',
            signedValue: '10',
            hex: '000000000000000a',
            binary: '0000000000000000000000000000000000000000000000000000000000001010',
            octal: '12',
            overflowed: false,
          },
        ],
      },
    });
  });

  it('fails on non-numeric input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-number' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Numeric Representation Inspector expects text input.', kind: 'invalid-input' } });
  });
});
