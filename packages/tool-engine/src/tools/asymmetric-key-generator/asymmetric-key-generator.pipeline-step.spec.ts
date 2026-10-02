import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./asymmetric-key-generator.pipeline-step.js";

describe('asymmetric-key-generator pipeline step', () => {
  it('generates an RSA-2048 key pair, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { anything: true } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('json');
    const pair = result.output.value as { family: string; detail: string; publicKeyPem: string; privateKeyPem: string };
    expect(pair.family).toBe('rsa');
    expect(pair.detail).toBe('RSA-2048');
    expect(pair.publicKeyPem).toMatch(/-----BEGIN PUBLIC KEY-----/);
    expect(pair.privateKeyPem).toMatch(/-----BEGIN PRIVATE KEY-----/);
  }, 15000);

  it('generates a different key pair on each call', async () => {
    const first = await pipelineStep.run({ type: 'json', value: null });
    const second = await pipelineStep.run({ type: 'json', value: null });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('expected ok');
    expect((first.output.value as { privateKeyPem: string }).privateKeyPem).not.toBe(
      (second.output.value as { privateKeyPem: string }).privateKeyPem,
    );
  }, 15000);
});
