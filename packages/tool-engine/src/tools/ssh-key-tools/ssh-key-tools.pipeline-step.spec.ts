import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./ssh-key-tools.pipeline-step.js";

describe('ssh-key-tools pipeline step', () => {
  it('generates an Ed25519 SSH public key line, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'ignored' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('text');
    expect(result.output.value as string).toMatch(/^ssh-ed25519 /);
  });

  it('generates a different key pair on each call', async () => {
    const first = await pipelineStep.run({ type: 'text', value: '' });
    const second = await pipelineStep.run({ type: 'text', value: '' });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('expected ok');
    expect(first.output.value).not.toBe(second.output.value);
  });
});
