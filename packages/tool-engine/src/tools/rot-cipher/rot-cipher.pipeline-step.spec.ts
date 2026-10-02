import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./rot-cipher.pipeline-step.js";

describe('rot-cipher pipeline step', () => {
  it('applies ROT13 to text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Hello, World!' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'Uryyb, Jbeyq!' } });
  });

  it('is self-inverse when run twice', async () => {
    const first = await pipelineStep.run({ type: 'text', value: 'secret' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await pipelineStep.run(first.output);
    expect(second).toEqual({ ok: true, output: { type: 'text', value: 'secret' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'ROT13 / ROT47 Cipher expects text input.', kind: 'invalid-input' } });
  });
});
