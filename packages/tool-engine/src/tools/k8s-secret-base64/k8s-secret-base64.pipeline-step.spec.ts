import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./k8s-secret-base64.pipeline-step.js";

describe('k8s-secret-base64 pipeline step', () => {
  it('encodes the default sample pair into a Secret data: block, ignoring its input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'this value is ignored' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'data:\n  username: YWRtaW4=' } });
  });

  it('produces the same output regardless of input value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { anything: true } });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'data:\n  username: YWRtaW4=' } });
  });
});
